const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8",
      });
      if (result.status !== 0) {
        console.error(result.stderr);
        process.exitCode = 1;
      }
    }
  }
}
["src", "scripts", "tests"].forEach(walk);
if (!process.exitCode)
  console.log(
    "All JavaScript syntax checks passed. Static frontend requires no compilation.",
  );
