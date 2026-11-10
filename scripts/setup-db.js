const { pool } = require("../src/backend/db");
const { migrate } = require("./migrate");
const { seed } = require("./seed");
(async () => {
  await migrate();
  await seed();
  console.log("Fitness database ready.");
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
