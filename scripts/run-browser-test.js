const { spawnSync } = require("node:child_process");
const result = spawnSync(process.execPath, ["scripts/browser-test.js"], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    DATABASE_MODE: "embedded",
    PGLITE_PATH: "memory://",
    PORT: "3101",
    AI_ENABLED: "false",
  },
});
process.exitCode = result.status || 0;
