const { randomUUID } = require("node:crypto");
const { pool, transaction } = require("../db");
async function list(userId) {
  const result = await pool.query(
    "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC NULLS LAST,created_at DESC",
    [userId],
  );
  if (!result.rowCount) return [];
  const exerciseRows = await pool.query(
    "SELECT e.*,x.name,x.muscle FROM workout_exercises e JOIN exercises x ON x.id=e.exercise_id JOIN workouts w ON w.id=e.workout_id WHERE w.user_id=$1 ORDER BY e.position",
    [userId],
  );
  const sets = await pool.query(
    "SELECT s.* FROM workout_sets s JOIN workout_exercises e ON e.id=s.workout_exercise_id JOIN workouts w ON w.id=e.workout_id WHERE w.user_id=$1 ORDER BY s.position",
    [userId],
  );
  return result.rows.map((w) => ({
    ...w,
    exercises: exerciseRows.rows
      .filter((e) => e.workout_id === w.id)
      .map((e) => ({
        ...e,
        exerciseId: e.exercise_id,
        targetMin: e.target_min,
        targetMax: e.target_max,
        restSeconds: e.rest_seconds,
        sets: sets.rows.filter((s) => s.workout_exercise_id === e.id),
      })),
  }));
}
async function save(userId, workout, editing = false) {
  return transaction(async (db) => {
    const ids = [...new Set(workout.exercises.map((e) => e.exerciseId))];
    const allowed = await db.query(
      "SELECT id FROM exercises WHERE id=ANY($1::text[]) AND (owner_id IS NULL OR owner_id=$2)",
      [ids, userId],
    );
    if (allowed.rowCount !== ids.length)
      throw Object.assign(new Error("An exercise is unavailable."), {
        status: 400,
      });
    if (editing) {
      const updated = await db.query(
        "UPDATE workouts SET name=$3,date=$4,fatigue=$5,pain=$6,notes=$7,version=version+1,updated_at=now() WHERE id=$1 AND user_id=$2 AND version=$8 RETURNING version",
        [
          workout.id,
          userId,
          workout.name,
          workout.date,
          workout.fatigue,
          workout.pain,
          workout.notes,
          workout.version,
        ],
      );
      if (!updated.rowCount)
        throw Object.assign(
          new Error(
            "This workout changed or is unavailable. Refresh history before editing.",
          ),
          { status: 409 },
        );
      await db.query("DELETE FROM workout_exercises WHERE workout_id=$1", [
        workout.id,
      ]);
    } else {
      const inserted = await db.query(
        "INSERT INTO workouts(id,user_id,name,date,fatigue,pain,notes) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id",
        [
          workout.id,
          userId,
          workout.name,
          workout.date,
          workout.fatigue,
          workout.pain,
          workout.notes,
        ],
      );
      if (!inserted.rowCount) {
        const existing = await db.query(
          "SELECT id FROM workouts WHERE id=$1 AND user_id=$2",
          [workout.id, userId],
        );
        if (!existing.rowCount)
          throw Object.assign(new Error("Workout ID is unavailable."), {
            status: 409,
          });
        return { id: workout.id, repeated: true };
      }
    }
    for (const [position, exercise] of workout.exercises.entries()) {
      const id = randomUUID();
      await db.query(
        "INSERT INTO workout_exercises(id,workout_id,exercise_id,position,notes,target_min,target_max,increment,rest_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          workout.id,
          exercise.exerciseId,
          position,
          exercise.notes,
          exercise.targetMin,
          exercise.targetMax,
          exercise.increment,
          exercise.restSeconds,
        ],
      );
      for (const [setPosition, set] of exercise.sets.entries()) {
        await db.query(
          "INSERT INTO workout_sets(id,workout_exercise_id,position,weight,reps,kind,rpe,rir) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            randomUUID(),
            id,
            setPosition,
            set.weight,
            set.reps,
            set.kind,
            set.rpe,
            set.rir,
          ],
        );
      }
    }
    return { id: workout.id };
  });
}
module.exports = { list, save };
