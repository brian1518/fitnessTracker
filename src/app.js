const express = require("express");
const path = require("node:path");
const mainRoutes = require("./backend/routers/mainRoutes");

const app = express();
app.disable("x-powered-by");
app.use("/api", mainRoutes);
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

module.exports = app;
