process.env.DATABASE_MODE = "embedded";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const path = require("node:path");

const { PGlite } = require("@electric-sql/pglite");
test("PostgreSQL filesystem storage survives closing and reopening", async () => {
  const root = mkdtempSync(path.join(process.cwd(), ".test-persistence-"));
  const dbPath = path.join(root, "data");
  let db;
  try {
    db = new PGlite(dbPath);
    await db.exec(
      "CREATE TABLE persistence_check(id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
    );
    await db.query("INSERT INTO persistence_check VALUES($1,$2)", [1, "saved"]);
    await db.close();
    db = new PGlite(dbPath);
    assert.equal(
      (await db.query("SELECT value FROM persistence_check WHERE id=1")).rows[0]
        .value,
      "saved",
    );
  } finally {
    if (db && !db.closed) await db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
