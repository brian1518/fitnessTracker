# Lantern Training

## Run locally

Install Node.js 22 or newer, then run these commands from the project folder.

    npm install
    npm run start

Open http://localhost:3000. Press Ctrl+C in the terminal to stop.
Use npm run dev to restart the server automatically after server file changes.
Refresh the browser after frontend changes.

## Architecture

Adapted from the supplied ByteMe architecture.

- src/server.js starts the local Node server.
- src/app.js configures Express, static assets, API routes and error handling.
- src/backend/routers maps API paths to controllers.
- src/backend/controllers handles requests and responses.
- src/backend/models provides the exercise catalog.
- src/public/index.html is the served workout interface.
- src/public/css/app.css contains the design system and theme.
- src/public/js/workouts.js handles logging, editing, progress and browser storage.

GET /api/exercises returns the exercise catalog as a JSON array.

Workouts are currently saved in localStorage in the browser. PostgreSQL,
authentication and multi-user access are not implemented in this stage.
Moving from a file URL to localhost creates a separate browser storage location.
Existing file-based history remains accessible at its original page address.
The original root HTML, CSS and JS are retained for accessing that history.
Make new interface changes inside src/public.

To use another port in PowerShell, set $env:PORT = "3001" before starting.
Different ports also have separate browser storage.
