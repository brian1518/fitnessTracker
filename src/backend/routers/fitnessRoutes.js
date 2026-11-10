const { randomUUID } = require("node:crypto");
const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const auth = require("../services/auth");
const v = require("../services/validation");
const workouts = require("../models/workoutModel");
const { recommend } = require("../services/progression");
const { analytics, generatePlan } = require("../services/analytics");
const ai = require("../services/ai");
const router = Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});
const credentials = v.z.object({
  email: v.z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: v.z.string().min(12).max(128),
  name: v.z.string().trim().min(1).max(80).optional(),
});
router.post("/auth/register", authLimit, async (req, res) => {
  const data = credentials.parse(req.body);
  if (!data.name) return res.status(400).json({ error: "Enter your name." });
  const id = randomUUID();
  await pool.query(
    "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
    [id, data.email, data.name, await auth.passwordHash(data.password)],
  );
  const session = await auth.createSession(id, res);
  res.status(201).json({ id, name: data.name, email: data.email, ...session });
});
// Sign-in accepts any non-empty password so a wrong one always gets the same
// "incorrect" answer instead of a validation message.
const loginCredentials = credentials
  .pick({ email: true })
  .extend({ password: v.z.string().min(1).max(128) });
router.post("/auth/login", authLimit, async (req, res) => {
  const data = loginCredentials.parse(req.body);
  const result = await pool.query("SELECT * FROM users WHERE email=$1", [
    data.email,
  ]);
  const user = result.rows[0];
  const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
  const valid = await auth.verifyPassword(
    data.password,
    user?.password_hash || dummy,
  );
  if (!user || !valid)
    return res.status(401).json({ error: "Email or password is incorrect." });
  const session = await auth.createSession(user.id, res);
  res.json({ id: user.id, name: user.name, email: user.email, ...session });
});
router.post("/auth/demo", authLimit, async (req, res) => {
  if (process.env.NODE_ENV === "production")
    return res.status(404).json({ error: "Demo is available locally only." });
  const { DEMO_ID } = require("../../../scripts/seed-demo");
  const result = await pool.query(
    "SELECT id,name,email,is_demo FROM users WHERE id=$1 AND is_demo=true",
    [DEMO_ID],
  );
  if (!result.rowCount)
    return res
      .status(503)
      .json({ error: "Restart the app to prepare the demo." });
  const user = result.rows[0];
  const session = await auth.createSession(user.id, res);
  res.json({ ...user, ...session });
});
router.use(auth.requireUser);
router.get("/auth/me", (req, res) => res.json(req.user));
router.post("/auth/logout", async (req, res) => {
  await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [
    auth.hash(auth.sessionToken(req)),
  ]);
  res.clearCookie("lantern_session", auth.cookieOptions).json({ ok: true });
});
const profileFor = async (userId) =>
  v.profile.parse(
    (await pool.query("SELECT data FROM profiles WHERE user_id=$1", [userId]))
      .rows[0]?.data || {},
  );
// Everything stored for the signed-in account, as one downloadable document.
router.get("/export", async (req, res) => {
  const id = req.user.id;
  const rows = async (sql) => (await pool.query(sql, [id])).rows;
  res.json({
    format: "lantern-training-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    units: { weight: "kg", length: "cm" },
    account: { name: req.user.name, email: req.user.email },
    profile: await profileFor(id),
    workouts: await workouts.list(id),
    routines: await rows(
      "SELECT id,name,data,created_at,updated_at FROM plans WHERE user_id=$1 ORDER BY updated_at DESC",
    ),
    bodyMeasurements: await rows(
      "SELECT date,weight,waist,notes FROM body_records WHERE user_id=$1 ORDER BY date DESC",
    ),
    goals: await rows(
      "SELECT kind,exercise_id,target,deadline,created_at FROM goals WHERE user_id=$1 ORDER BY created_at DESC",
    ),
    customExercises: await rows(
      "SELECT id,name,muscle,equipment FROM exercises WHERE owner_id=$1 ORDER BY name",
    ),
    coachMessages: await rows(
      "SELECT question,answer,created_at FROM ai_messages WHERE user_id=$1 ORDER BY created_at DESC",
    ),
  });
});
// Permanently removes the account; related records are removed by cascade.
router.post("/account/delete", authLimit, async (req, res) => {
  const { password } = v.z
    .object({ password: v.z.string().min(1).max(128) })
    .parse(req.body);
  if (req.user.is_demo)
    return res
      .status(403)
      .json({ error: "The demo account cannot be deleted." });
  const user = (
    await pool.query("SELECT password_hash FROM users WHERE id=$1", [
      req.user.id,
    ])
  ).rows[0];
  if (!user || !(await auth.verifyPassword(password, user.password_hash)))
    return res.status(400).json({ error: "Password is incorrect." });
  await pool.query("DELETE FROM users WHERE id=$1", [req.user.id]);
  res.clearCookie("lantern_session", auth.cookieOptions).json({ ok: true });
});
const customExercise = v.z.object({
  name: v.z.string().trim().min(2).max(80),
  muscle: v.z.enum([
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "quads",
    "hamstrings",
    "glutes",
    "calves",
    "core",
  ]),
  equipment: v.z.enum([
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "bodyweight",
    "pullup-bar",
    "dip-bars",
    "other",
  ]),
});
router.post("/exercises", async (req, res) => {
  const data = customExercise.parse(req.body);
  const existing = await pool.query(
    "SELECT 1 FROM exercises WHERE lower(name)=lower($1) AND (owner_id IS NULL OR owner_id=$2)",
    [data.name, req.user.id],
  );
  if (existing.rowCount)
    return res
      .status(409)
      .json({ error: "An exercise with this name already exists." });
  const owned = await pool.query(
    "SELECT count(*)::int AS n FROM exercises WHERE owner_id=$1",
    [req.user.id],
  );
  if (owned.rows[0].n >= 200)
    return res
      .status(400)
      .json({ error: "An account supports up to 200 custom exercises." });
  const exercise = { id: "custom-" + randomUUID(), ...data };
  await pool.query(
    "INSERT INTO exercises(id,name,muscle,equipment,owner_id) VALUES($1,$2,$3,$4,$5)",
    [exercise.id, data.name, data.muscle, data.equipment, req.user.id],
  );
  res.status(201).json(exercise);
});
router.get("/exercises", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT * FROM exercises WHERE owner_id IS NULL OR owner_id=$1 ORDER BY name",
        [req.user.id],
      )
    ).rows,
  ),
);
router.get("/profile", async (req, res) => {
  const result = await pool.query(
    "SELECT data FROM profiles WHERE user_id=$1",
    [req.user.id],
  );
  res.json(v.profile.parse(result.rows[0]?.data || {}));
});
router.put("/profile", async (req, res) => {
  const data = v.profile.parse(req.body);
  await pool.query(
    "INSERT INTO profiles(user_id,data) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET data=$2,updated_at=now()",
    [req.user.id, data],
  );
  res.json(data);
});
router.get("/workouts", async (req, res) =>
  res.json(await workouts.list(req.user.id)),
);
router.post("/workouts", async (req, res) =>
  res
    .status(201)
    .json(await workouts.save(req.user.id, v.workout.parse(req.body))),
);
router.put("/workouts/:id", async (req, res) => {
  const data = v.workout.parse({ ...req.body, id: req.params.id });
  if (!data.version)
    return res.status(400).json({ error: "Workout version is required." });
  res.json(await workouts.save(req.user.id, data, true));
});
router.delete("/workouts/:id", async (req, res) => {
  v.z.uuid().parse(req.params.id);
  const result = await pool.query(
    "DELETE FROM workouts WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user.id],
  );
  if (!result.rowCount)
    return res.status(404).json({ error: "Workout not found." });
  res.json({ ok: true });
});
router.post("/recommendation", async (req, res) => {
  const options = v.z
    .object({
      exerciseId: v.z.string(),
      targetMin: v.z.number().int().min(1).max(50),
      targetMax: v.z.number().int().min(1).max(50),
      increment: v.z.number().min(0).max(100),
      setCount: v.z.number().int().min(1).max(10),
      fatigue: v.z.number().min(0).max(10),
      pain: v.z.boolean(),
      today: v.date,
    })
    .refine((x) => x.targetMax >= x.targetMin)
    .parse(req.body);
  const owned = await pool.query(
    "SELECT 1 FROM exercises WHERE id=$1 AND (owner_id IS NULL OR owner_id=$2)",
    [options.exerciseId, req.user.id],
  );
  if (!owned.rowCount)
    return res.status(404).json({ error: "Exercise not found." });
  const recommendation = recommend(await workouts.list(req.user.id), options);
  await pool.query(
    "INSERT INTO recommendations(user_id,exercise_id,data) VALUES($1,$2,$3) ON CONFLICT(user_id,exercise_id) DO UPDATE SET data=$3,updated_at=now()",
    [req.user.id, options.exerciseId, recommendation],
  );
  res.json(recommendation);
});
router.get("/plans", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT * FROM plans WHERE user_id=$1 ORDER BY updated_at DESC",
        [req.user.id],
      )
    ).rows,
  ),
);
router.post("/plans/generate", async (req, res) => {
  const profile = v.profile.parse(req.body);
  if (req.user.is_demo) profile.aiConsent = false;
  const exercises = (
    await pool.query(
      "SELECT * FROM exercises WHERE owner_id IS NULL OR owner_id=$1 ORDER BY name",
      [req.user.id],
    )
  ).rows;
  const recent = (await workouts.list(req.user.id)).slice(0, 5).map((w) => ({
    date: w.date,
    fatigue: w.fatigue,
    pain: w.pain,
    exercises: w.exercises.map((e) => ({
      exercise: e.name,
      sets: e.sets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        rir: s.rir,
      })),
    })),
  }));
  res.json(
    await ai.plan(
      req.user.id,
      profile,
      exercises,
      recent,
      generatePlan(profile, exercises),
    ),
  );
});
router.post("/plans", async (req, res) => {
  const data = v.plan.parse(req.body);
  await checkExercises(
    req.user.id,
    data.days.flatMap((day) => day.exercises.map((e) => e.exerciseId)),
  );
  const id = randomUUID();
  await pool.query(
    "INSERT INTO plans(id,user_id,name,data) VALUES($1,$2,$3,$4)",
    [id, req.user.id, data.name, data],
  );
  res.status(201).json({ id });
});
router.put("/plans/:id", async (req, res) => {
  const id = v.z.uuid().parse(req.params.id);
  const data = v.plan.parse(req.body);
  await checkExercises(
    req.user.id,
    data.days.flatMap((day) => day.exercises.map((e) => e.exerciseId)),
  );
  const result = await pool.query(
    "UPDATE plans SET name=$3,data=$4,updated_at=now() WHERE id=$1 AND user_id=$2",
    [id, req.user.id, data.name, data],
  );
  if (!result.rowCount)
    return res.status(404).json({ error: "Plan not found." });
  res.json({ id });
});
router.get("/goals", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT * FROM goals WHERE user_id=$1 ORDER BY created_at DESC",
        [req.user.id],
      )
    ).rows,
  ),
);
router.post("/goals", async (req, res) => {
  const data = v.goal.parse(req.body);
  const id = randomUUID();
  if (data.exerciseId) await checkExercises(req.user.id, [data.exerciseId]);
  await pool.query(
    "INSERT INTO goals(id,user_id,kind,exercise_id,target,deadline) VALUES($1,$2,$3,$4,$5,$6)",
    [id, req.user.id, data.kind, data.exerciseId, data.target, data.deadline],
  );
  res.status(201).json({ id });
});
router.delete("/goals/:id", async (req, res) => {
  const result = await pool.query(
    "DELETE FROM goals WHERE id=$1 AND user_id=$2",
    [v.z.uuid().parse(req.params.id), req.user.id],
  );
  res
    .status(result.rowCount ? 200 : 404)
    .json(result.rowCount ? { ok: true } : { error: "Goal not found." });
});
router.get("/body", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT * FROM body_records WHERE user_id=$1 ORDER BY date DESC",
        [req.user.id],
      )
    ).rows,
  ),
);
router.post("/body", async (req, res) => {
  const data = v.body.parse(req.body);
  await pool.query(
    "INSERT INTO body_records(id,user_id,date,weight,waist,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,date) DO UPDATE SET weight=$4,waist=$5,notes=$6",
    [randomUUID(), req.user.id, data.date, data.weight, data.waist, data.notes],
  );
  res.json({ ok: true });
});
router.get("/analytics", async (req, res) => {
  const today = v.date.parse(req.query.today);
  res.json(
    analytics(
      await workouts.list(req.user.id),
      (
        await pool.query(
          "SELECT * FROM body_records WHERE user_id=$1 ORDER BY date DESC",
          [req.user.id],
        )
      ).rows,
      today,
    ),
  );
});
// Tells the interface whether AI interpretation can run, without exposing keys.
router.get("/coach/status", async (req, res) => {
  const dailyLimit = ai.dailyCap();
  const usedToday =
    (
      await pool.query(
        "SELECT requests FROM ai_usage WHERE user_id=$1 AND date=CURRENT_DATE",
        [req.user.id],
      )
    ).rows[0]?.requests || 0;
  let reason = req.user.is_demo
    ? "demo"
    : ai.unavailableReason(await profileFor(req.user.id));
  if (!reason && usedToday >= dailyLimit) reason = "daily_limit";
  res.json({ available: !reason, reason, dailyLimit, usedToday });
});
router.get("/coach", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT question,answer,created_at FROM ai_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
        [req.user.id],
      )
    ).rows,
  ),
);
router.post("/coach", async (req, res) => {
  const { question, today } = v.z
    .object({ question: v.z.string().trim().min(1).max(1000), today: v.date })
    .parse(req.body);
  const history = await workouts.list(req.user.id);
  const body = (
    await pool.query(
      "SELECT * FROM body_records WHERE user_id=$1 ORDER BY date DESC",
      [req.user.id],
    )
  ).rows;
  const facts = analytics(history, body, today);
  const profile = v.profile.parse(
    (
      await pool.query("SELECT data FROM profiles WHERE user_id=$1", [
        req.user.id,
      ])
    ).rows[0]?.data || {},
  );
  facts.recentSessions = history.slice(0, 8).map((w) => ({
    date: w.date,
    fatigue: w.fatigue,
    pain: w.pain,
    exercises: w.exercises.map((e) => ({
      name: e.name,
      sets: e.sets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        kind: s.kind,
        rpe: s.rpe,
        rir: s.rir,
      })),
    })),
  }));
  facts.goals = (
    await pool.query(
      "SELECT kind,exercise_id,target,deadline FROM goals WHERE user_id=$1",
      [req.user.id],
    )
  ).rows;
  facts.bodyTrend = body
    .slice(0, 8)
    .map((r) => ({ date: r.date, weight: r.weight }));
  if (req.user.is_demo) profile.aiConsent = false;
  const answer = await ai.review(req.user.id, question, facts, profile);
  if (req.user.is_demo) answer.sourceReason = "demo";
  await pool.query(
    "INSERT INTO ai_messages(id,user_id,question,answer) VALUES($1,$2,$3,$4)",
    [randomUUID(), req.user.id, question, answer],
  );
  res.json(answer);
});
router.post("/import", async (req, res) =>
  res.json(
    await require("../services/import").importHistory(
      req.user.id,
      req.body.sets,
    ),
  ),
);
async function checkExercises(userId, ids) {
  const allowed = await pool.query(
    "SELECT id FROM exercises WHERE id=ANY($1::text[]) AND (owner_id IS NULL OR owner_id=$2)",
    [ids, userId],
  );
  if (new Set(ids).size !== allowed.rowCount)
    throw Object.assign(new Error("An exercise is unavailable."), {
      status: 400,
    });
}
module.exports = router;
