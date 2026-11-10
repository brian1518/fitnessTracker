const fs = require("node:fs");
const path = require("node:path");
const { pool, transaction, embedded } = require("../src/backend/db");
async function migrate() {
  await transaction(async (db) => {
    if (!embedded) await db.query("SELECT pg_advisory_xact_lock(2814001)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    for (const name of fs
      .readdirSync(path.join(__dirname, "../migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (await db.query("SELECT 1 FROM migrations WHERE name=$1", [name]))
          .rowCount
      )
        continue;
      await db.query(
        fs.readFileSync(path.join(__dirname, "../migrations", name), "utf8"),
      );
      await db.query("INSERT INTO migrations(name) VALUES ($1)", [name]);
      console.log("Applied " + name);
    }
  });
}
module.exports = { migrate };
if (require.main === module)
  migrate()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
