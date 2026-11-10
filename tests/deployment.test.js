process.env.DATABASE_MODE = "embedded";
process.env.PGLITE_PATH = "memory://";
process.env.AI_ENABLED = "false";
process.env.APP_ORIGIN = "https://brian1518.github.io";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { migrate } = require("../scripts/migrate");
const { pool } = require("../src/backend/db");
const { buildPages } = require("../scripts/build-pages");
const app = require("../src/app");
test("Pages cross-origin sessions, CSRF, origin restrictions and logout", async () => {
  await migrate();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const origin = process.env.APP_ORIGIN;
  const call = (route, method = "GET", body, extra = {}) =>
    fetch(base + route, {
      method,
      headers: { Origin: origin, "Content-Type": "application/json", ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    const preflight = await call("/api/auth/register", "OPTIONS", undefined, {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "authorization,content-type,x-csrf-token",
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    const registration = await call("/api/auth/register", "POST", {
      name: "Pages user",
      email: "pages@example.test",
      password: "pages-test-password",
    });
    assert.equal(registration.status, 201);
    const user = await registration.json();
    assert.match(user.sessionToken, /^[a-f0-9]{64}$/);
    const bearer = { Authorization: "Bearer " + user.sessionToken };
    const me = await call("/api/auth/me", "GET", undefined, bearer);
    assert.equal(me.status, 200);
    assert.equal((await me.json()).id, user.id);
    assert.equal((await call("/api/profile", "PUT", {}, bearer)).status, 403);
    assert.equal(
      (
        await call(
          "/api/profile",
          "PUT",
          {},
          { ...bearer, "X-CSRF-Token": user.csrf },
        )
      ).status,
      200,
    );
    const rejected = await call("/api/auth/me", "GET", undefined, {
      ...bearer,
      Origin: "https://evil.example",
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
    assert.equal(
      (
        await call(
          "/api/auth/logout",
          "POST",
          {},
          { ...bearer, "X-CSRF-Token": user.csrf },
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/api/auth/me", "GET", undefined, bearer)).status,
      401,
    );
    assert.equal((await fetch(base + "/healthz")).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
test("Pages package includes only public assets and works at a repository subpath", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lantern-pages-"));
  try {
    assert.throws(() => buildPages("", dir), /PAGES_API_ORIGIN/);
    assert.throws(
      () => buildPages("https://user:secret@example.com/api", dir),
      /HTTPS origin/,
    );
    buildPages("https://lantern-test.onrender.com", dir);
    const files = fs
      .readdirSync(dir, { recursive: true })
      .filter((name) => fs.statSync(path.join(dir, name)).isFile())
      .map((name) => name.replaceAll("\\", "/"))
      .sort();
    assert.deepEqual(files, [
      ".nojekyll",
      "css/app.css",
      "favicon.svg",
      "index.html",
      "js/config.js",
      "js/fitness.js",
      "js/workout-logger.js",
      "vendor/lucide.js",
    ]);
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
    assert.match(html, /id="homeView"/);
    assert.match(html, /id="authForm"/);
    const config = fs.readFileSync(path.join(dir, "js/config.js"), "utf8");
    assert.match(config, /"demoEnabled":false/);
    assert.match(config, /lantern-test.onrender.com/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
