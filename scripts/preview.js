// Isolated local preview: in-memory database with demo data, AI off, no .env.
// Nothing here touches your real local database or any provider.
process.env.DATABASE_MODE = "embedded";
process.env.PGLITE_PATH = "memory://";
process.env.AI_ENABLED = "false";
process.env.PORT = process.env.PREVIEW_PORT || "3210";
delete process.env.APP_ORIGIN;
delete process.env.NODE_ENV;
require("../src/server");
