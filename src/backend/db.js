const fs = require("node:fs");
const path = require("node:path");
const { Pool, types } = require("pg");
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1700, Number);
const embedded = process.env.DATABASE_MODE !== "postgres";
let pool;
let transaction;
if (embedded) {
  const { PGlite } = require("@electric-sql/pglite");
  const dataPath =
    process.env.PGLITE_PATH || path.resolve(__dirname, "../../.fitness-db");
  let db;
  let ownedLock = null;
  function releaseLock() {
    if (ownedLock) {
      fs.rmSync(ownedLock, { force: true });
      ownedLock = null;
    }
  }
  function getDb() {
    if (db) return db;
    if (!dataPath.startsWith("memory://")) {
      const lockPath = path.resolve(dataPath) + ".lock";
      if (fs.existsSync(lockPath)) {
        const pid = Number(fs.readFileSync(lockPath, "utf8"));
        try {
          process.kill(pid, 0);
          throw Error(
            "The local database is already open. Stop the other app instance first.",
          );
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
          fs.rmSync(lockPath);
        }
      }
      fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      ownedLock = lockPath;
    }
    db = new PGlite(dataPath, {
      parsers: { 1082: (value) => value, 1700: Number },
    });
    return db;
  }
  process.on("exit", releaseLock);
  const adapter = (client) => ({
    async query(sql, params) {
      if (!params && sql.includes(";")) {
        const results = await client.exec(sql);
        const result = results.at(-1) || { rows: [], affectedRows: 0 };
        return {
          ...result,
          rowCount: result.rows.length || result.affectedRows || 0,
        };
      }
      const result = await client.query(sql, params);
      return {
        ...result,
        rowCount: result.rows.length || result.affectedRows || 0,
      };
    },
  });
  pool = {
    query: (sql, params) => adapter(getDb()).query(sql, params),
    async end() {
      if (db) await db.close();
      releaseLock();
    },
  };
  transaction = (work) =>
    getDb().transaction((client) => work(adapter(client)));
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
  transaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}
module.exports = { pool, transaction, embedded };
