# Deployment & Operations

## Architecture

- **Lunafy:** one persistent Node.js 22 process running the compiled Discord bot only. No Express, Vite, dashboard files, HTTP listener, inbound port, or scheduler API.
- **GitHub Pages:** static Vite dashboard only.
- **Trusted API:** separate Node.js service built from `server.ts`; it serves authenticated `/api/*` routes and OAuth callbacks but does not start a Discord Gateway or scheduler. It must not be deployed on Lunafy.
- **Firestore:** shared persistent database and one-way bot-control queue. Bot and trusted API use Firebase Admin credentials only in their server environments.

The API is a necessary security boundary for the dashboard; GitHub Pages cannot call Firebase Admin or Discord privileged APIs directly. It validates each user's Discord permissions, signs authorized bot commands, and writes them to Firestore. The Lunafy bot polls and executes commands only for guilds in its Gateway session; no inbound Lunafy port is used. Live Discord/Firebase end-to-end testing is still required before production use.

### Does the API run on Firebase?

Not as currently implemented. Firebase provides Firestore for shared data; `server.ts` is a regular Express/Node.js API, not a Firebase Cloud Function. The trusted API is deployed separately on Google Cloud Run in the existing Firebase project.

At launch, the components fit together like this:

1. Keep the bot running as a persistent Node.js process on Lunafy. It connects to Discord and polls Firestore for authorized work.
2. Keep the trusted API on Cloud Run. Its HTTPS origin, server-side secrets, and Firestore runtime identity are configured there.
3. Keep the dashboard static on GitHub Pages and use the repository variable `VITE_API_BASE_URL` to point to the API's HTTPS origin.
4. Add the published Pages origin to the API's `ALLOWED_ORIGINS`, and register the API's `/auth/callback` URL as the Discord OAuth redirect.
5. Give the API and bot the same Firebase project and server-only `BOT_CONTROL_SECRET`. Do not put either service's secrets in dashboard variables.

### Current Cloud Run deployment

- Project: `shadowslayers-7f48f`
- Service and region: `shadowslayers-api` in `europe-west4`
- API origin: `https://shadowslayers-api-vloo4dmzfa-ez.a.run.app`
- Health endpoint: `GET /api/health` returned healthy with the Firestore adapter; dashboard-origin CORS preflight returned `204`.
- GitHub Actions variable `VITE_API_BASE_URL` is set to the API origin. The existing website's own dashboard build must use the same public value.
- Cloud Run runs as `shadowslayers-api@shadowslayers-7f48f.iam.gserviceaccount.com`, with Firestore access and access only to the API's required Secret Manager secrets. It uses Application Default Credentials; no Firebase service-account key is mounted in the container.
- Cloud Run is limited to one instance because OAuth state and rate-limit windows are currently held in process memory.
- API CORS currently allows the website origin `https://wolfyslayer.online`; the dashboard URL path does not belong in `ALLOWED_ORIGINS`.
- The GitHub Pages workflow exists, but Pages is not enabled. The planned website route `https://wolfyslayer.online/shadow-slayers/dashboard` returned `404` when checked, so the dashboard itself is not confirmed live there.
- Register `https://shadowslayers-api-vloo4dmzfa-ez.a.run.app/auth/callback` as an OAuth2 redirect URI in the Discord Developer Portal before testing sign-in. The API can generate the correct Discord authorization URL, but the full Discord callback flow has not been verified.

The Cloud Run image is built from `Dockerfile`. `.gcloudignore` excludes local environment files, the local `.data` database, dashboard files, tests, and generated outputs. Express is a production dependency. The API uses the Cloud Run service identity for Firestore rather than a downloaded service-account key.

### Changing API secrets

Use Google Cloud Console → Secret Manager to add a new version of the appropriate secret, then deploy a new Cloud Run revision so new instances receive it. Do not put secret values in the dashboard, website source, GitHub Actions variables, or chat.

| Secret Manager name | Used for | Rotation notes |
| --- | --- | --- |
| `discord-bot-token` | API's live Discord membership and permission checks | Update the bot host's `DISCORD_BOT_TOKEN` as well if the token is rotated. |
| `discord-client-secret` | Discord OAuth2 | Register the API callback URL in Discord Developer Portal; the client ID is a non-secret Cloud Run setting. |
| `session-secret` | Signing dashboard sessions and deletion tokens | Changing it invalidates existing sessions and outstanding deletion tokens. |
| `bot-control-secret` | Signing API-to-bot commands | The API and Lunafy bot must use the exact same value. Rotate both sides together. |

The Cloud Run service currently references each secret's `latest` version. After adding a version, deploy a new revision or update the secret reference to a specific version so the running service reloads it. `APP_URL`, `ALLOWED_ORIGINS`, `FIREBASE_PROJECT_ID`, and `DISCORD_CLIENT_ID` are configuration values, not secret values.

## Windows local development (PowerShell)

```powershell
npm ci
if (-not (Test-Path .env)) { New-Item -ItemType File -Path .env | Out-Null }
notepad .env
```

For local dashboard and OAuth testing, configure the API and frontend origins in the repository-root `.env`:

```dotenv
DATABASE_ADAPTER=firestore
PORT=3000
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3000
VITE_BASE_PATH=/
BOT_CONTROL_SECRET=<same random 32+ character secret for API and bot>
DISCORD_CLIENT_ID=<Discord application ID>
DISCORD_CLIENT_SECRET=<Discord OAuth client secret>
DISCORD_BOT_TOKEN=<bot token>
FIREBASE_PROJECT_ID=<Firebase project ID>
FIREBASE_CLIENT_EMAIL=<service account email>
FIREBASE_PRIVATE_KEY=<private key, with newlines encoded as \n>
```

For isolated tests without Firebase, use `DATABASE_ADAPTER=local`; API-to-bot actions require Firestore and the same project in both processes. Generate a control secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and keep it server-side. `DISCORD_GUILD_ID` is not required: the bot discovers every guild where it is installed.

In the Discord Developer Portal, add `http://localhost:3000/auth/callback` as an OAuth2 redirect URI. Enable **Server Members Intent** and **Message Content Intent** under Bot → Privileged Gateway Intents. Keep the OAuth client secret and bot token server-side; never rename them with a `VITE_` prefix. `VITE_BASE_PATH=/` is the local default. The bot token is used by the API to verify live guild membership and permissions; configure it only in trusted server environments, never in the frontend.

Run the API, dashboard, and (when testing live Discord behavior) bot in separate terminals:

```powershell
npm run dev:dashboard
npm run dev:api
npm run dev:bot
```

The OAuth popup callback is registered on the API origin, while its response is sent only to the exact allowed frontend origin that initiated the flow. Builds and tests do not require Discord credentials:

```powershell
npm run build:bot
npm run build:dashboard
npm test
npm run lint
```

## Lunafy: bot-only deployment

Build the bot on a CI/build machine using Node.js 22:

```sh
npm ci
npm run build:bot
```

Deploy `package.json`, `package-lock.json`, and the compiled `dist-bot/` directory. Configure these variables in Lunafy:

- `NODE_ENV=production`
- `DATABASE_ADAPTER=firestore`
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_COMMAND_SCOPE=auto` (or `guild` / `global`)
- `BOT_CONTROL_SECRET` (same 32+ character secret as the trusted API)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (newlines may be entered as `\n`)

Configure the same `BOT_CONTROL_SECRET` and Firebase project credentials on the API host. `DISCORD_GUILD_ID` is not required; the bot discovers installed guilds and registers commands in each guild.

Lunafy installation and persistent startup commands:

```sh
npm ci --omit=dev
npm run start:bot
```

Configure `npm run start:bot` as the persistent process command. It validates configuration, initializes Firestore, starts the scheduler and Discord Gateway, registers slash commands, and handles SIGINT/SIGTERM. It does not open a port. The target's exact packaging/upload workflow has not been verified against Lunafy; no workspaces are assumed.

## Trusted API runtime configuration

Do not host the API on Lunafy. Cloud Run supplies `PORT`; configure the deployed service with:

`NODE_ENV=production`, `APP_URL` (the HTTPS API origin only), `ALLOWED_ORIGINS` (the exact dashboard origin), `DATABASE_ADAPTER=firestore`, and `FIREBASE_PROJECT_ID`. `DISCORD_CLIENT_ID` is a non-secret setting. `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `BOT_CONTROL_SECRET`, and `SESSION_SECRET` are mounted from Secret Manager. The API's session and bot-control secrets were generated for this deployment; configure the same `BOT_CONTROL_SECRET` on Lunafy before bot-control operations are expected to work. Do not copy secret values into the dashboard or source repository.

The Cloud Run runtime identity uses platform Application Default Credentials for Firestore. Other hosts may continue using the existing server-side service-account credential fields. The API never starts a Gateway; live operations are sent to the bot through the shared Firestore queue.

## GitHub Pages

1. Enable GitHub Pages with GitHub Actions as the source.
2. The repository **variable** `VITE_API_BASE_URL` is set to the public HTTPS API origin (origin only, no credentials or query string). It is configuration, not a secret.
3. The workflow supplies `VITE_BASE_PATH` from the repository name, executes `npm run build:dashboard`, and uploads `dist/`. No bot or Firebase credential is needed.
4. Configure the API's `ALLOWED_ORIGINS` for the published Pages origin. OAuth2 redirect URLs must target the trusted API's `/auth/callback`.

The Pages workflow has not yet been enabled in repository settings. The intended dashboard host is the existing website, not GitHub Pages. Build the dashboard for the website's route with `VITE_API_BASE_URL` set to the public API origin and `VITE_BASE_PATH=/shadow-slayers/dashboard/`; upload the resulting `dist/` contents to that route. The API CORS setting uses only `https://wolfyslayer.online`, without the route path. If `VITE_API_BASE_URL` is unset, the static build still succeeds, but authentication/data requests cannot reach an API. Static dashboard deployment never builds or restarts the bot.

## Firebase setup

1. Create or select a Firebase project and enable a Firestore Native database.
2. Keep browser access denied. The dashboard has no Firebase client SDK authentication or direct Firestore operation; Admin SDK requests bypass Firestore Security Rules.
3. Create a server-side service identity with the minimum required Firestore IAM permissions. The Cloud Run API identity already has `roles/datastore.user` for this project and uses Application Default Credentials.
4. Configure the bot's server-side Firebase credentials and the exact same `BOT_CONTROL_SECRET` in Lunafy and the trusted API only. The API's `BOT_CONTROL_SECRET` is held in Secret Manager; never commit a service-account JSON file or place an Admin credential/control secret in a `VITE_` variable.
5. Firestore Admin SDK requests bypass Firestore Security Rules. Preserve the API's authentication, guild-ID validation, capability checks, command signatures, and audit writes; Firestore rules do not replace these controls.

## CI

GitHub Actions uses Node.js 22 and `npm ci`. Independent bot and dashboard jobs build without live Discord/Firebase credentials. A separate quality job runs `npm test`, `npm run lint`, `npm run security:check`, and `npm audit --audit-level=high`.
