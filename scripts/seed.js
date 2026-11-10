const { pool, transaction } = require("../src/backend/db");
const { catalog } = require("../src/backend/data/exercises");
async function seed() {
  await transaction(async (db) => {
    for (const exercise of catalog) {
      await db.query(
        "INSERT INTO exercises(id,name,muscle,equipment) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
        [exercise.id, exercise.name, exercise.muscle, exercise.equipment],
      );
    }
  });
  console.log("Exercise library ready (" + catalog.length + " exercises).");
}
module.exports = { seed };
if (require.main === module)
  seed()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
