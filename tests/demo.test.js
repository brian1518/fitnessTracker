process.env.DATABASE_MODE = "embedded";
process.env.PGLITE_PATH = "memory://";
process.env.AI_ENABLED = "false";
const test = require("node:test");
const assert = require("node:assert/strict");
const { migrate } = require("../scripts/migrate");
const { seed } = require("../scripts/seed");
const { seedDemo, DEMO_ID } = require("../scripts/seed-demo");
const { pool } = require("../src/backend/db");
const app = require("../src/app");
test("demo is repeatable, isolated, and accessible without paid AI", async () => {
  let server;
  try {
    await migrate();
    await seed();
    assert.equal(await seedDemo(), true);
    assert.equal(await seedDemo(), false);
    const count = await pool.query(
      "SELECT count(*)::int AS n FROM workouts WHERE user_id=$1",
      [DEMO_ID],
    );
    assert.equal(count.rows[0].n, 24);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    const login = await fetch(base + "/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(login.status, 200);
    const user = await login.json();
    assert.equal(user.is_demo, true);
    const headers = { Cookie: login.headers.get("set-cookie").split(";")[0] };
    for (const [route, length] of [
      ["workouts", 24],
      ["body", 12],
      ["plans", 1],
      ["goals", 3],
      ["exercises", 181],
    ]) {
      const response = await fetch(base + "/api/" + route, { headers });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).length, length);
    }
    const profile = await (
      await fetch(base + "/api/profile", { headers })
    ).json();
    assert.equal(profile.aiConsent, false);
    const real = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Real user",
        email: "real@example.test",
        password: "long-password-example",
      }),
    });
    const realHeaders = {
      Cookie: real.headers.get("set-cookie").split(";")[0],
    };
    assert.equal(
      (
        await (
          await fetch(base + "/api/workouts", { headers: realHeaders })
        ).json()
      ).length,
      0,
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
