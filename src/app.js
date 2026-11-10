const express = require("express");
const path = require("node:path");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const app = express();
app.disable("x-powered-by");
// Render terminates TLS at one reverse proxy.
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "upgrade-insecure-requests":
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.vary("Origin");
  const origin = req.get("Origin");
  const expected =
    process.env.APP_ORIGIN || "http://localhost:" + (process.env.PORT || 3000);
  if (origin && origin !== expected)
    return res.status(403).json({ error: "Request origin is not allowed." });
  if (origin === expected) {
    res.set("Access-Control-Allow-Origin", expected);
    res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-CSRF-Token",
    );
    res.set("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Please wait a moment and try again." },
  }),
);
app.get("/healthz", async (req, res) => {
  try {
    await require("./backend/db").pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});
app.use("/api", require("./backend/routers/fitnessRoutes"));
app.get("/vendor/lucide.js", (req, res) =>
  res.sendFile(
    path.join(__dirname, "../node_modules/lucide/dist/umd/lucide.js"),
  ),
);
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((error, req, res, next) => {
  if (error.name === "ZodError")
    return res.status(400).json({
      error: error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .join("; "),
    });
  if (error.code === "23505")
    return res.status(409).json({ error: "This record already exists." });
  if (error.code === "23503")
    return res
      .status(400)
      .json({ error: "An exercise or related record was not found." });
  if (error.status)
    return res
      .status(error.status)
      .json({ error: error.status < 500 ? error.message : "Server error." });
  console.error(error.message);
  res
    .status(500)
    .json({ error: "Unable to complete the request. Please try again." });
});
module.exports = app;
