const { pool } = require("./backend/db");
const { migrate } = require("../scripts/migrate");
const { seed } = require("../scripts/seed");
const app = require("./app");
const port = Number(process.env.PORT || 3000);
async function start() {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be between 1 and 65535.");
  if (process.env.NODE_ENV === "production") {
    if (process.env.DATABASE_MODE !== "postgres" || !process.env.DATABASE_URL)
      throw Error("Production requires a persistent PostgreSQL DATABASE_URL.");
    const origin = new URL(process.env.APP_ORIGIN || "");
    if (
      origin.protocol !== "https:" ||
      origin.origin !== process.env.APP_ORIGIN
    )
      throw Error(
        "APP_ORIGIN must be the HTTPS website origin without a path.",
      );
  }
  await migrate();
  await seed();
  if (process.env.NODE_ENV !== "production") {
    await require("../scripts/seed-demo").seedDemo();
  }
  const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log("Lantern Training is ready at http://localhost:" + port),
  );
  server.on("error", async (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Port " + port + " is already in use. Stop the other server first."
        : error.message,
    );
    await pool.end();
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    });
}
start().catch(async (error) => {
  console.error(error.message);
  await pool.end();
  process.exitCode = 1;
});
