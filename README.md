# Lantern Training

**A Green Lantern-inspired fitness tracker for logging workouts, building routines, and following your progress.**

[Open the live app](https://brian1518.github.io/fitnessTracker/) · [Deployment guide](docs/DEPLOYMENT.md)

Lantern Training brings exercise history, next-session targets, body measurements, and training goals into one place. Its workout logger uses exercise cards inspired by Hevy, with a dark green interface, clear inputs, and set-completion feedback.

## Features

- **Workout logging:** multiple exercise cards, previous sets, weight and reps, warm-up sets, optional RPE/RIR, notes, and automatic rest timers.
- **181 exercises:** search and filter by muscle group or equipment, plus custom exercises for your account.
- **Progression suggestions:** next-session targets based on completed sets, rep ranges, load increments, effort, fatigue, and training history.
- **History and routines:** review, edit, repeat workouts, and load a complete training day from a saved plan.
- **Progress tracking:** workout analytics, exercise trends, bodyweight and waist measurements, and strength, bodyweight, or weekly-frequency goals.
- **Optional AI coach:** ask training questions using xAI/Grok and your recorded progress.
- **Local demo:** explore sample workouts without affecting your account or using paid AI credits.

## Try the live app

Visit **[Lantern Training](https://brian1518.github.io/fitnessTracker/)** and select **Create an account**.

1. Set your goals, experience, equipment, and preferences in **Settings**.
2. Open **Today's workout** and add exercises, or start a saved routine.
3. Enter weight and reps, then check off each completed set.
4. Select **Finish workout** to save the session.
5. Review **Workout history** and **Your progress**.

Local and hosted accounts use separate databases. Your localhost account and records do not transfer automatically to the live website.

## Start

Install Node.js **22.15 or newer**, npm, and Git. A separate database installation is not required for local development.

```powershell
git clone https://github.com/brian1518/fitnessTracker.git
cd fitnessTracker
npm install
Copy-Item .env.example .env
npm start
```

On macOS or Linux, use `cp .env.example .env` instead of `Copy-Item`. Keep your existing `.env` if it is already configured. Use `npm run dev` for automatic server restarts during development.

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

## Technology

| Layer           | Technology                                                      |
| --------------- | --------------------------------------------------------------- |
| Interface       | HTML, CSS, vanilla JavaScript, Lucide icons                     |
| Server          | Node.js and Express                                             |
| Local database  | Embedded PostgreSQL with PGlite                                 |
| Hosted database | PostgreSQL on Render                                            |
| Validation      | Zod                                                             |
| Optional AI     | xAI chat completions API                                        |
| Tests           | Node.js test runner, JSDOM, Playwright                          |
| Hosting         | GitHub Pages for the interface; Render for the API and database |

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

The current app is served from `src/public`. The root `index.html` and `script.js` belong to the older tracker and are retained for legacy data export.

Authentication uses scrypt password hashes and hashed session tokens. The local interface uses HttpOnly cookies; GitHub Pages uses a token held in the browser tab's session storage to avoid third-party cookie dependency. Sessions expire after seven days, and signing out revokes them. API writes require a CSRF token, and cross-origin browser access is restricted to the configured website origin. Queries scope personal records to the authenticated account. Concurrent workout edits use version checks. Workout saves use stable IDs for retry protection.

## AI setup

The coach combines your question with your training profile, recent sessions, analytics, goals, and bodyweight trend. It returns a summary, interpretations, suggested adjustments, and next targets. It does not change saved workouts automatically.

The application also works with AI disabled: the plan generator uses a deterministic template and the coach returns a basic recorded-data summary.

To enable xAI, obtain your own API key and configure AI_ENABLED=true and XAI_API_KEY in .env. Then enable consent in Settings. No credits are purchased automatically. Keys are used only on the backend. Requests send relevant training context without account name or email. The provider never changes saved records.

The adapter uses the official chat completions endpoint, JSON schema responses, local output validation, a 25-second timeout and a configurable per-account daily request cap. Token usage is stored in ai_usage. Failed requests fall back without retrying billable generations automatically.

Example local configuration:

```dotenv
AI_ENABLED=true
XAI_API_KEY=your_private_key_here
XAI_MODEL=grok-4.7
AI_DAILY_LIMIT=10
```

For the hosted app, set these values in Render's environment settings instead. Never put API keys in frontend files or GitHub Pages variables. Check the provider's current model availability and pricing before enabling AI.

| Response label         | Meaning                                                        |
| ---------------------- | -------------------------------------------------------------- |
| xAI interpretation     | The provider generated a response using your training context. |
| recorded-data fallback | AI is disabled, unavailable, or at its daily request limit.    |

The default limit is 10 requests per account per day, shared by coaching and plan generation. Previous answers are saved for viewing, but earlier chat messages are not included in subsequent prompts.

## Verification

    npm test
    npm run check
    npm run build

The frontend is served directly, so build performs syntax verification without bundling. Browser regression coverage is available with an installed Microsoft Edge:

    npm run test:browser

Browser tests use an isolated in-memory database. The browser launcher may be restricted by desktop automation permissions.

## Deployment

The interface is hosted on **GitHub Pages**, with the **Express API and PostgreSQL database on Render**. The repository includes `.github/workflows/pages.yml` and `render.yaml` for deployment. See the [full deployment guide](docs/DEPLOYMENT.md).

| Location                           | Setting            | Value for this deployment                   |
| ---------------------------------- | ------------------ | ------------------------------------------- |
| GitHub Actions repository variable | `PAGES_API_ORIGIN` | `https://lantern-training-api.onrender.com` |
| Render environment                 | `APP_ORIGIN`       | `https://brian1518.github.io`               |

The Pages build uploads only public website assets. Database credentials and AI keys stay on the backend. Production startup requires external PostgreSQL. The `/healthz` endpoint checks database connectivity.

**Free hosting limits:** the selected Render web service sleeps when idle, so the first request may take longer. The free PostgreSQL database expires after 30 days; export your data or upgrade before expiry. See [Render's free-plan documentation](https://render.com/docs/free).

## Development commands

| Command                | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `npm start`            | Start the application                                       |
| `npm run dev`          | Start with automatic server restarts                        |
| `npm test`             | Run API, UI, database, and logic tests                      |
| `npm run lint`         | Check formatting                                            |
| `npm run build`        | Check JavaScript syntax                                     |
| `npm run build:pages`  | Package public assets using `PAGES_API_ORIGIN`              |
| `npm run test:browser` | Run browser regression checks with Microsoft Edge           |
| `npm run seed:demo`    | Create local demo data while the server is stopped          |
| `npm run preview`      | Isolated preview on port 3210: in-memory data, demo, AI off |

## Current limitations

- Email verification and password recovery are not implemented (the app sends no email).
- Weights are kilograms only; there is no unit setting.
- Workout drafts are kept in the browser (local storage) until finished; they do not sync between devices.
- The public deployment does not include the local demo account or local user records.
- AI follow-up questions do not retain conversation context.
- Multiple server instances require a shared request limiter instead of the current in-memory limiter.

## Training calculations

Only working sets count toward volume and strength estimates. Volume is weight multiplied by reps. Estimated 1RM uses the Epley formula for loaded sets of ten reps or fewer and is labeled as an estimate. Bodyweight exercise volume is not body mass times reps.

Progression requires comparable working sets and targets. Reaching the top of the range with manageable recorded effort can suggest the configured increment. Fatigue, pain, training gaps, changed targets and unavailable increments alter or block progression. Users always choose and can edit loads.

## Attribution

Lantern Training is an independent project inspired by Green Lantern and Hevy's workout logging patterns. It is not affiliated with Hevy or DC.
