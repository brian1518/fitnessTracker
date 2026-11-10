const { randomUUID, randomBytes } = require("node:crypto");
const { pool, transaction } = require("../src/backend/db");
const { passwordHash } = require("../src/backend/services/auth");
const DEMO_ID = "d3e00000-0000-4000-8000-000000000001";
function dateBefore(today, days) {
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
async function seedDemo() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const hash = await passwordHash(randomBytes(32).toString("hex"));
  return transaction(async (db) => {
    if (
      (await db.query("SELECT 1 FROM demo_seed_versions WHERE version=1"))
        .rowCount
    )
      return false;
    const exists = await db.query("SELECT is_demo FROM users WHERE id=$1", [
      DEMO_ID,
    ]);
    if (exists.rowCount && !exists.rows[0].is_demo)
      throw Error("Demo identity conflict.");
    await db.query(
      "INSERT INTO users(id,email,name,password_hash,is_demo) VALUES($1,'demo@lantern.example','Lantern Demo', $2,true) ON CONFLICT(id) DO NOTHING",
      [DEMO_ID, hash],
    );
    await db.query(
      "INSERT INTO profiles(user_id,data) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",
      [
        DEMO_ID,
        {
          goal: "strength",
          experience: "intermediate",
          age: null,
          frequency: 4,
          duration: 60,
          split: "Upper/Lower",
          equipment: [
            "barbell",
            "dumbbell",
            "machine",
            "cable",
            "bodyweight",
            "pullup-bar",
          ],
          muscles: [],
          preferences: "Sample profile for exploring the app.",
          limitations: "",
          recovery: "Sample data only.",
          aiConsent: false,
        },
      ],
    );
    const upper = [
      ["bench-press", 40],
      ["dumbbell-row", 18],
      ["overhead-press", 22.5],
      ["curl", 8],
    ];
    const lower = [
      ["squat", 50],
      ["rdl", 20],
      ["leg-press", 80],
      ["calf-raise", 0],
    ];
    for (let week = 0; week < 6; week++) {
      for (let session = 0; session < 4; session++) {
        const upperDay = session % 2 === 0;
        const choices = upperDay ? upper : lower;
        const workoutId = randomUUID();
        const offset = (5 - week) * 7 + [6, 5, 3, 1][session];
        await db.query(
          "INSERT INTO workouts(id,user_id,name,date,fatigue,notes) VALUES($1,$2,$3,$4,$5,$6)",
          [
            workoutId,
            DEMO_ID,
            "Demo · " +
              (upperDay ? "Upper" : "Lower") +
              " " +
              (session < 2 ? "A" : "B"),
            dateBefore(date, offset),
            week === 3 ? 7 : 3,
            "Illustrative sample workout.",
          ],
        );
        for (const [position, [exerciseId, baseWeight]] of choices.entries()) {
          const exerciseRow = randomUUID();
          await db.query(
            "INSERT INTO workout_exercises(id,workout_id,exercise_id,position,notes,target_min,target_max,increment,rest_seconds) VALUES($1,$2,$3,$4,$5,8,12,2.5,120)",
            [
              exerciseRow,
              workoutId,
              exerciseId,
              position,
              "Sample technique note · controlled reps.",
            ],
          );
          for (let set = 0; set < 3; set++) {
            const weight = baseWeight ? baseWeight + (week >= 4 ? 2.5 : 0) : 0;
            const reps = week === 3 ? 8 : week === 5 ? 10 : 8 + (week % 3) * 2;
            await db.query(
              "INSERT INTO workout_sets(id,workout_exercise_id,position,weight,reps,kind,rpe,rir) VALUES($1,$2,$3,$4,$5,'working',$6,$7)",
              [
                randomUUID(),
                exerciseRow,
                set,
                weight,
                reps - (set === 2 && week === 1 ? 1 : 0),
                week === 3 ? 9 : 8,
                week === 3 ? 1 : 2,
              ],
            );
          }
        }
      }
    }
    const plan = {
      name: "Demo · Upper / Lower",
      guidance:
        "Illustrative routine. Review the exercises and loads before your own training.",
      days: [
        ["Upper A", upper],
        ["Lower A", lower],
        ["Upper B", upper],
        ["Lower B", lower],
      ].map(([name, list]) => ({
        name,
        exercises: list.map(([exerciseId]) => ({
          exerciseId,
          sets: 3,
          targetMin: 8,
          targetMax: 12,
          restSeconds: 120,
        })),
      })),
    };
    await db.query(
      "INSERT INTO plans(id,user_id,name,data) VALUES($1,$2,$3,$4)",
      [randomUUID(), DEMO_ID, plan.name, plan],
    );
    for (let i = 0; i < 12; i++)
      await db.query(
        "INSERT INTO body_records(id,user_id,date,weight,waist,notes) VALUES($1,$2,$3,$4,$5,'Sample measurement')",
        [
          randomUUID(),
          DEMO_ID,
          dateBefore(date, (11 - i) * 3),
          Number((78 - i * 0.12).toFixed(1)),
          Number((85 - i * 0.15).toFixed(1)),
        ],
      );
    for (const [kind, exercise, target] of [
      ["strength", "bench-press", 50],
      ["bodyweight", null, 75],
      ["frequency", null, 4],
    ])
      await db.query(
        "INSERT INTO goals(id,user_id,kind,exercise_id,target,deadline) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), DEMO_ID, kind, exercise, target, dateBefore(date, -42)],
      );
    await db.query("INSERT INTO demo_seed_versions(version) VALUES(1)");
    console.log(
      "Demo ready: 24 workouts, 12 measurements, 1 routine, 3 goals.",
    );
    return true;
  });
}
module.exports = { seedDemo, DEMO_ID };
if (require.main === module) {
  const { migrate } = require("./migrate");
  const { seed } = require("./seed");
  (async () => {
    await migrate();
    await seed();
    await seedDemo();
  })()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
