process.env.DATABASE_MODE = "embedded";
process.env.PGLITE_PATH = "memory://";
process.env.AI_ENABLED = "false";
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { migrate } = require("../scripts/migrate");
const { seed } = require("../scripts/seed");
const { pool } = require("../src/backend/db");
const app = require("../src/app");
test("database, authentication, ownership, workouts, goals, import, and AI fallback", async () => {
  await migrate();
  await migrate();
  await seed();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  async function call(path, method = "GET", data, session = {}) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: session.cookie || "",
        "X-CSRF-Token": session.csrf || "",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  try {
    assert.equal((await call("/workouts")).status, 401);
    const a = await call("/auth/register", "POST", {
      name: "Test A",
      email: "a@example.test",
      password: "test-password-123",
    });
    assert.equal(a.status, 201, JSON.stringify(a.data));
    const sa = { cookie: a.cookie, csrf: a.data.csrf };
    const b = await call("/auth/register", "POST", {
      name: "Test B",
      email: "b@example.test",
      password: "test-password-456",
    });
    const sb = { cookie: b.cookie, csrf: b.data.csrf };
    assert.equal(
      (
        await call("/auth/login", "POST", {
          email: "a@example.test",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (await call("/profile", "PUT", {}, { cookie: a.cookie })).status,
      403,
    );
    const workout = {
      id: randomUUID(),
      name: "Upper",
      date: "2026-11-09",
      exercises: [
        {
          exerciseId: "bench-press",
          sets: [
            { weight: 40, reps: 8 },
            { weight: 40, reps: 8 },
            { weight: 40, reps: 7 },
          ],
        },
      ],
    };
    const saved = await call("/workouts", "POST", workout, sa);
    assert.equal(saved.status, 201, JSON.stringify(saved.data));
    assert.equal((await call("/workouts", "POST", workout, sa)).status, 201);
    assert.equal(
      (await call("/workouts", "GET", undefined, sa)).data.length,
      1,
    );
    assert.equal(
      (await call("/workouts", "GET", undefined, sb)).data.length,
      0,
    );
    assert.equal(
      (await call("/workouts/" + workout.id, "DELETE", undefined, sb)).status,
      404,
    );
    assert.equal(
      (
        await call(
          "/workouts/" + workout.id,
          "PUT",
          { ...workout, version: 1 },
          sb,
        )
      ).status,
      409,
    );
    const summary = await call(
      "/analytics?today=2026-11-09",
      "GET",
      undefined,
      sa,
    );
    assert.equal(summary.data.volume, 920);
    assert.equal(summary.data.prs["bench-press"].weight, 40);
    assert.equal(
      (
        await call(
          "/workouts/" + workout.id,
          "PUT",
          { ...workout, version: 1, name: "Edited" },
          sa,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/workouts/" + workout.id,
          "PUT",
          { ...workout, version: 1 },
          sa,
        )
      ).status,
      409,
    );
    const invalid = await call(
      "/workouts",
      "POST",
      {
        ...workout,
        id: randomUUID(),
        exercises: [{ exerciseId: "missing", sets: [{ weight: 40, reps: 8 }] }],
      },
      sa,
    );
    assert.equal(invalid.status, 400);
    assert.equal(
      (await call("/workouts", "GET", undefined, sa)).data.length,
      1,
    );
    const goal = await call(
      "/goals",
      "POST",
      { kind: "strength", exerciseId: "bench-press", target: 60 },
      sa,
    );
    assert.equal(goal.status, 201);
    assert.equal((await call("/goals", "GET", undefined, sb)).data.length, 0);
    assert.equal(
      (await call("/body", "POST", { date: "2026-11-09", weight: 75 }, sa))
        .status,
      200,
    );
    assert.equal(
      (await call("/body", "POST", { date: "2026-11-09", weight: 74.8 }, sa))
        .status,
      200,
    );
    assert.equal((await call("/body", "GET", undefined, sa)).data.length, 1);
    const imported = {
      sets: [{ exercise: "Bench Press", weight: "20", reps: "10" }],
    };
    assert.equal(
      (await call("/import", "POST", imported, sa)).data.imported,
      1,
    );
    assert.equal(
      (await call("/import", "POST", imported, sa)).data.imported,
      0,
    );
    const coach = await call(
      "/coach",
      "POST",
      { question: "Review this week", today: "2026-11-09" },
      sa,
    );
    assert.equal(coach.status, 200, JSON.stringify(coach.data));
    assert.equal(coach.data.source, "recorded-data fallback");
    assert.equal(coach.data.sourceReason, "disabled");
    assert.ok(coach.data.adjustments.every((item) => item.includes("Why:")));
    const status = await call("/coach/status", "GET", undefined, sa);
    assert.deepEqual(
      { available: status.data.available, reason: status.data.reason },
      { available: false, reason: "disabled" },
    );
    assert.equal(JSON.stringify(status.data).includes("XAI"), false);
    assert.equal((await call("/coach", "GET", undefined, sb)).data.length, 0);
    const customImport = {
      sets: [{ exercise: "Private exercise A", weight: 12, reps: 8 }],
    };
    assert.equal(
      (await call("/import", "POST", customImport, sa)).data.imported,
      1,
    );
    const libraryA = (await call("/exercises", "GET", undefined, sa)).data;
    const privateExercise = libraryA.find(
      (e) => e.name === "Private exercise A",
    );
    assert.ok(privateExercise);
    assert.equal(
      (await call("/exercises", "GET", undefined, sb)).data.some(
        (e) => e.id === privateExercise.id,
      ),
      false,
    );
    assert.equal(
      (
        await call(
          "/goals",
          "POST",
          { kind: "strength", exerciseId: privateExercise.id, target: 30 },
          sb,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/workouts",
          "POST",
          {
            ...workout,
            id: randomUUID(),
            exercises: [
              {
                exerciseId: privateExercise.id,
                sets: [{ weight: 12, reps: 8 }],
              },
            ],
          },
          sb,
        )
      ).status,
      400,
    );
    const aiService = require("../src/backend/services/ai");
    process.env.AI_ENABLED = "true";
    process.env.XAI_API_KEY = "test-only-never-transmitted";
    process.env.AI_DAILY_LIMIT = "1";
    let providerCalls = 0;
    aiService.provider.generate = async () => {
      providerCalls++;
      throw new Error("Simulated provider timeout");
    };
    assert.equal(
      (await call("/profile", "PUT", { aiConsent: true }, sa)).status,
      200,
    );
    const failedAI = await call(
      "/coach",
      "POST",
      { question: "Review", today: "2026-11-09" },
      sa,
    );
    assert.equal(failedAI.data.source, "recorded-data fallback");
    assert.equal(failedAI.data.sourceReason, "provider_error");
    assert.equal(
      (await call("/coach/status", "GET", undefined, sa)).data.reason,
      "daily_limit",
    );
    assert.equal(
      (await call("/coach/status", "GET", undefined, sb)).data.reason,
      "no_consent",
    );
    await call(
      "/coach",
      "POST",
      { question: "Review again", today: "2026-11-09" },
      sa,
    );
    assert.equal(providerCalls, 1);
    for (const resource of [
      "/",
      "/css/app.css",
      "/js/fitness.js",
      "/vendor/lucide.js",
    ]) {
      const response = await fetch(base + resource);
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    assert.equal((await fetch(base + "/.env")).status, 404);
    // Custom exercises are private and cannot shadow an existing name.
    const custom = await call(
      "/exercises",
      "POST",
      { name: "Zercher Carry Test", muscle: "shoulders", equipment: "barbell" },
      sa,
    );
    assert.equal(custom.status, 201);
    assert.equal(
      (
        await call(
          "/exercises",
          "POST",
          { name: "bench press", muscle: "chest", equipment: "barbell" },
          sa,
        )
      ).status,
      409,
    );
    assert.equal(
      (await call("/exercises", "GET", undefined, sb)).data.some(
        (e) => e.id === custom.data.id,
      ),
      false,
    );
    // Export returns only the caller's records and no credentials.
    const exported = await call("/export", "GET", undefined, sa);
    assert.equal(exported.status, 200);
    assert.equal(exported.data.format, "lantern-training-export");
    assert.ok(exported.data.workouts.length > 0);
    assert.ok(
      exported.data.customExercises.some((e) => e.id === custom.data.id),
    );
    assert.doesNotMatch(
      JSON.stringify(exported.data),
      /password_hash|token_hash|csrf/,
    );
    assert.equal(
      (await call("/export", "GET", undefined, sb)).data.workouts.length,
      0,
    );
    // Sign-in never reveals password rules; deletion needs the right password.
    // An empty name field (as a sign-in form sends) must not block sign-in.
    assert.equal(
      (
        await call("/auth/login", "POST", {
          name: "",
          email: "b@example.test",
          password: "test-password-456",
        })
      ).status,
      200,
    );
    const shortLogin = await call("/auth/login", "POST", {
      email: "a@example.test",
      password: "short",
    });
    assert.equal(shortLogin.status, 401);
    assert.equal(shortLogin.data.error, "Email or password is incorrect.");
    assert.equal(
      (
        await call(
          "/account/delete",
          "POST",
          { password: "wrong-password-x" },
          sb,
        )
      ).status,
      400,
    );
    assert.equal((await call("/workouts", "GET", undefined, sb)).status, 200);
    assert.equal(
      (
        await call(
          "/account/delete",
          "POST",
          { password: "test-password-456" },
          sb,
        )
      ).status,
      200,
    );
    assert.equal((await call("/workouts", "GET", undefined, sb)).status, 401);
    assert.equal(
      (
        await call("/auth/login", "POST", {
          email: "b@example.test",
          password: "test-password-456",
        })
      ).status,
      401,
    );
    assert.equal((await call("/auth/logout", "POST", {}, sa)).status, 200);
    assert.equal((await call("/workouts", "GET", undefined, sa)).status, 401);
    // Deleting an account that owns workouts and custom exercises removes it all.
    const again = await call("/auth/login", "POST", {
      email: "a@example.test",
      password: "test-password-123",
    });
    assert.equal(again.status, 200);
    const sa2 = { cookie: again.cookie, csrf: again.data.csrf };
    assert.equal(
      (
        await call(
          "/account/delete",
          "POST",
          { password: "test-password-123" },
          sa2,
        )
      ).status,
      200,
    );
    for (const table of ["workouts", "plans", "goals", "body_records"])
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM " + table + " WHERE user_id=$1",
            [a.data.id],
          )
        ).rows[0].n,
        0,
      );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM exercises WHERE owner_id IS NOT NULL",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
