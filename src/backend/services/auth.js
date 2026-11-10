const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const { pool } = require("../db");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 7 * 86400000,
};
async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return salt + ":" + key.toString("hex");
}
async function verifyPassword(password, encoded) {
  const [salt, key] = encoded.split(":");
  const actual = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(key, "hex"));
}
async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(24).toString("hex");
  await pool.query(
    "INSERT INTO auth_sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
    [hash(token), userId, csrf],
  );
  res.cookie("lantern_session", token, cookieOptions);
  return { csrf, sessionToken: token };
}
function sessionToken(req) {
  const authorization = req.get("Authorization");
  if (authorization) return /^Bearer ([a-f0-9]{64})$/.exec(authorization)?.[1];
  return req.cookies.lantern_session;
}
async function requireUser(req, res, next) {
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ error: "Please sign in." });
  const result = await pool.query(
    "SELECT u.id,u.name,u.email,u.is_demo,s.csrf FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hash(token)],
  );
  if (!result.rowCount)
    return res
      .status(401)
      .json({ error: "Your session expired. Please sign in again." });
  req.user = result.rows[0];
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.get("X-CSRF-Token") !== req.user.csrf
  ) {
    return res
      .status(403)
      .json({ error: "Please refresh this page and try again." });
  }
  next();
}
module.exports = {
  passwordHash,
  verifyPassword,
  createSession,
  sessionToken,
  requireUser,
  hash,
  cookieOptions,
};
