"use strict";
const fs = require("node:fs");
const path = require("node:path");
function buildPages(
  apiOrigin,
  output = path.resolve(__dirname, "../dist-pages"),
) {
  let url;
  try {
    url = new URL(apiOrigin);
  } catch {
    throw Error(
      "Set PAGES_API_ORIGIN to the Render service HTTPS origin before building.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error(
      "PAGES_API_ORIGIN must be an HTTPS origin with no path, credentials, or query.",
    );
  // Copy an explicit public allowlist; never package the repository or .env.
  fs.mkdirSync(output, { recursive: true });
  for (const folder of ["css", "js", "vendor"])
    fs.mkdirSync(path.join(output, folder), { recursive: true });
  const root = path.resolve(__dirname, "../src/public");
  for (const file of [
    "index.html",
    "favicon.svg",
    "css/app.css",
    "js/fitness.js",
    "js/workout-logger.js",
  ])
    fs.copyFileSync(path.join(root, file), path.join(output, file));
  fs.copyFileSync(
    path.resolve(__dirname, "../node_modules/lucide/dist/umd/lucide.js"),
    path.join(output, "vendor/lucide.js"),
  );
  fs.writeFileSync(
    path.join(output, "js/config.js"),
    "window.LANTERN_CONFIG = " +
      JSON.stringify({ apiBase: url.origin, demoEnabled: false }) +
      ";\n",
  );
  fs.writeFileSync(path.join(output, ".nojekyll"), "");
  return output;
}
module.exports = { buildPages };
if (require.main === module) {
  try {
    console.log(
      "Public website built in " + buildPages(process.env.PAGES_API_ORIGIN),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
