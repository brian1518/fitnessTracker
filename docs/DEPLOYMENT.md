# Publish with GitHub Pages and Render

The public interface runs on GitHub Pages. Express and PostgreSQL run on Render. Only explicit public assets are uploaded to Pages. Production startup requires PostgreSQL so redeploying cannot silently erase an embedded database.

## First deployment

1. Push the app source and render.yaml to brian1518/fitnessTracker on the main branch.
2. In Render, choose New > Blueprint and select this repository (or paste its public Git URL).
3. Review the resources and price estimate before deploying. The blueprint selects paid web and PostgreSQL plans in Singapore for durable hosting. No resources are created by the local build.
4. Wait for the backend to report healthy. Open its HTTPS URL followed by /healthz; it should return {"ok":true}.
5. In GitHub repository Settings > Secrets and variables > Actions > Variables, add PAGES_API_ORIGIN with the Render service origin, e.g. https://your-service.onrender.com. This is a public URL, not a secret. Do not include /api.
6. In repository Settings > Pages, select GitHub Actions as the source.
7. Run the Publish fitness app workflow from Actions. It tests the app, builds the public assets, and publishes the Pages artifact.
8. Visit https://brian1518.github.io/fitnessTracker/ and create an account. Local accounts and workout records are not automatically copied into the hosted database.

Render APP_ORIGIN must be https://brian1518.github.io (no repository path). If changing the Pages domain, update APP_ORIGIN too. If using a public Git URL without connecting Render's GitHub integration, trigger Render deploys manually after pushing backend changes.

## AI

In the Render service's Environment settings, add XAI_API_KEY privately and set AI_ENABLED=true. Use a fresh key because the previous key was shared in chat. Never put keys in GitHub variables, frontend config, source code, or a Pages artifact. Enable AI consent in your own app account's Settings. AI calls use the Render key and can incur provider charges. The default per-account daily cap is 10 requests shared by plans and coaching; for a public audience also set a provider-side spending limit.

## Login and data

The local app continues to use HttpOnly session cookies. The Pages interface uses a random server-issued session token in sessionStorage and sends it in the Authorization header, avoiding third-party cookie dependency. Reloading the same tab preserves the login; closing it normally requires signing in again. Tokens are stored hashed in the database and expire after seven days; sign-out revokes the session. Mutations also require the session's CSRF token. CORS permits only APP_ORIGIN. Scripts running on the same Pages origin can access tab storage, so keep other sites under that origin trusted.

The unauthenticated demo login is disabled in production. Demo data stays local. Database migrations and the 181-exercise library seed run at server startup without resetting existing accounts.

## Checks and rollback

Run npm test and npm run build locally. To build the Pages artifact, set PAGES_API_ORIGIN then run npm run build:pages. Missing or unsafe origins fail the build. The Pages workflow serves dist-pages, not the legacy root index.html.

Keep database backups through Render. To roll back, redeploy the previous app commit on Render and rerun its Pages workflow; database migrations are forward-only and should be reviewed separately.

Official references:

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://render.com/docs/blueprint-spec
- https://render.com/docs/compute-plans
