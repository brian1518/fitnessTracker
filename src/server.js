const app = require("./app");

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a whole number between 1 and 65535.");
  process.exit(1);
}
const server = app.listen(port, "127.0.0.1", () => {
  console.log("Lantern Training is running at http://localhost:" + port);
  console.log("Press Ctrl+C to stop.");
});
server.on("error", error => {
  console.error(error.code === "EADDRINUSE"
    ? "Port " + port + " is already in use. Stop the other server or choose another PORT."
    : error.message);
  process.exitCode = 1;
});
