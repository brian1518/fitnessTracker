const { createHash, randomUUID } = require("node:crypto");
const { transaction } = require("../db");
const { z, date } = require("./validation");
const legacy = z.object({
  exercise: z.string().trim().min(1).max(100),
  weight: z.coerce.number().min(0).max(1500),
  reps: z.coerce.number().int().min(1).max(500),
  date: date.optional().nullable(),
  notes: z.string().max(1000).optional(),
});
const digest = (value) => createHash("sha256").update(value).digest("hex");
async function importHistory(userId, raw) {
  const sets = z.array(legacy).max(10000).parse(raw);
  return transaction(async (db) => {
    const occurrences = new Map();
    const groups = new Map();
    for (const set of sets) {
      const canonical = JSON.stringify({
        exercise: set.exercise.toLowerCase(),
        weight: set.weight,
        reps: set.reps,
        date: set.date || null,
        notes: set.notes || "",
      });
      const occurrence = occurrences.get(canonical) || 0;
      occurrences.set(canonical, occurrence + 1);
      const fingerprint = digest(canonical + "#" + occurrence);
      const claimed = await db.query(
        "INSERT INTO imported_sets(user_id,fingerprint) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING fingerprint",
        [userId, fingerprint],
      );
      if (!claimed.rowCount) continue;
      const key = set.date || "undated";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...set, fingerprint });
    }
    for (const [day, group] of groups) {
      const id = randomUUID();
      await db.query(
        "INSERT INTO workouts(id,user_id,name,date) VALUES($1,$2,'Imported workout',$3)",
        [id, userId, day === "undated" ? null : day],
      );
      const exerciseRows = new Map();
      let position = 0;
      for (const set of group) {
        const existing = await db.query(
          "SELECT id FROM exercises WHERE lower(name)=lower($1) AND (owner_id IS NULL OR owner_id=$2) ORDER BY owner_id NULLS FIRST",
          [set.exercise, userId],
        );
        const exerciseId =
          existing.rows[0]?.id ||
          "legacy-" + digest(userId + set.exercise.toLowerCase()).slice(0, 20);
        if (!existing.rowCount)
          await db.query(
            "INSERT INTO exercises(id,name,muscle,equipment,owner_id) VALUES($1,$2,'unclassified','other',$3) ON CONFLICT(id) DO NOTHING",
            [exerciseId, set.exercise, userId],
          );
        if (!exerciseRows.has(exerciseId)) {
          const exerciseRow = randomUUID();
          await db.query(
            "INSERT INTO workout_exercises(id,workout_id,exercise_id,position,notes) VALUES($1,$2,$3,$4,$5)",
            [exerciseRow, id, exerciseId, position++, set.notes || ""],
          );
          exerciseRows.set(exerciseId, { id: exerciseRow, position: 0 });
        }
        const row = exerciseRows.get(exerciseId);
        await db.query(
          "INSERT INTO workout_sets(id,workout_exercise_id,position,weight,reps,kind) VALUES($1,$2,$3,$4,$5,'working')",
          [randomUUID(), row.id, row.position++, set.weight, set.reps],
        );
        await db.query(
          "UPDATE imported_sets SET workout_id=$3 WHERE user_id=$1 AND fingerprint=$2",
          [userId, set.fingerprint, id],
        );
      }
    }
    return { imported: groups.size };
  });
}
module.exports = { importHistory };
