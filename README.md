# Lantern Training

A standalone fitness application with user accounts, workout sessions, deterministic double progression, routines, analytics, body measurements, goals, and optional xAI coaching.

## Start

Node.js 22.15 or newer is required.

    npm install
    npm run start

Open http://localhost:3000 and create your own account. Keep the terminal open. Press Ctrl+C to stop.

Startup applies pending SQL migrations and seeds the exercise library. It does not reset user data. If .env is missing, copy .env.example to .env.

## Try the demo and workout logger

Restart the app after updating, then choose **Explore demo workouts** on the sign-in screen (sign out first if needed). Local startup creates an isolated demo account once: 24 sample workouts across six weeks, 12 body measurements, an Upper/Lower routine, and three goals. Your own account stays separate. Demo coaching and plans never call the paid AI provider. Demo login is disabled in production.

To seed manually while the server is stopped, run npm run seed:demo. Rerunning does not duplicate records or reset edits to the demo.

Today's Workout supports several exercise cards, previous set values, optional effort fields, automatic rest timers, and drafts saved within the browser tab. Choose from 181 exercises with search, muscle, and equipment filters. Enter weight and reps, check off each finished set, then choose **Finish workout**. Only checked sets are saved; you will be prompted before unchecked sets are left out. Editing a set unchecks it so you can confirm the revised values. Saved routines load all exercises together.

The workout interaction takes reference from [Hevy's exercise programming](https://www.hevyapp.com/features/exercise-programming-options/) while retaining the app's green theme.

## Data

Local development uses embedded PostgreSQL through @electric-sql/pglite. Data lives in .fitness-db on the server filesystem. Run one server process at a time. Back up this folder while the server is stopped. A lock prevents concurrent app processes. If the process is terminated abruptly, confirm the app has stopped before removing .fitness-db.lock.

For a separate PostgreSQL server, set DATABASE_MODE=postgres and DATABASE_URL in .env, then start the app. Embedded and external databases are separate stores. Changing modes does not transfer data.

Use Settings to review and import older localStorage workouts. For a file-based copy, open the original tracker and use Export history, then import its JSON file. Original sets remain in their old browser storage. Imported sets without dates remain undated.

## Application structure

- src/app.js configures security headers, request limits, cookies and API routing.
- src/server.js initializes the database and starts the local server.
- src/backend/db.js adapts embedded and external PostgreSQL connections.
- src/backend/routers/fitnessRoutes.js defines authenticated endpoints.
- src/backend/models/workoutModel.js saves whole sessions transactionally.
- src/backend/services contains validation, authentication, progression, analytics, import and AI logic.
- src/public contains the responsive frontend and custom design system.
- migrations contains versioned, transactional SQL migrations.
- tests contains isolated database/API and deterministic logic tests.

Authentication uses scrypt password hashes, hashed opaque session tokens, HttpOnly cookies, SameSite protection and CSRF headers. Queries scope personal records to the authenticated account. Concurrent workout edits use version checks. Workout saves use stable IDs for retry protection.

## AI setup

The application works with AI disabled. The plan generator uses a deterministic template and the coach returns recorded facts.

To enable xAI, obtain your own API key and configure AI_ENABLED=true and XAI_API_KEY in .env. Then enable consent in Settings. No credits are purchased automatically. Keys are used only on the backend. Requests send relevant training context without account name or email. The provider never changes saved records.

The adapter uses the official chat completions endpoint, JSON schema responses, local output validation, a 25-second timeout and a configurable per-account daily request cap. Token usage is stored in ai_usage. Failed requests fall back without retrying billable generations automatically.

The configured model is grok-4.7. Official documentation checked November 9, 2026 lists base short-context pricing of $2 per million input tokens and $6 per million output tokens. Pricing and availability can change. Check https://docs.x.ai/developers/pricing before enabling.

## Verification

    npm test
    npm run check
    npm run build

The frontend is served directly, so build performs syntax verification without bundling. Browser regression coverage is available with an installed Microsoft Edge:

    npm run test:browser

Browser tests use an isolated in-memory database. The browser launcher may be restricted by desktop automation permissions.

## Deployment

The included server binds to loopback for local use. Public deployment requires an HTTPS reverse proxy, APP_ORIGIN, NODE_ENV=production, an external PostgreSQL database, persistent backups and a suitable distributed rate-limit store if running multiple server processes. Email verification, password recovery and operational monitoring are not implemented.

## Training calculations

Only working sets count toward volume and strength estimates. Volume is weight multiplied by reps. Estimated 1RM uses the Epley formula for loaded sets of ten reps or fewer and is labeled as an estimate. Bodyweight exercise volume is not body mass times reps.

Progression requires comparable working sets and targets. Reaching the top of the range with manageable recorded effort can suggest the configured increment. Fatigue, pain, training gaps, changed targets and unavailable increments alter or block progression. Users always choose and can edit loads.
