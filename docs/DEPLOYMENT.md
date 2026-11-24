# Deployment & Operations

## Architecture

- **Lunafy:** one persistent Node.js 22 process running the compiled Discord bot only. No Express, Vite, dashboard files, HTTP listener, inbound port, or scheduler API.
- **GitHub Pages:** static Vite dashboard only.
- **Trusted API:** separate Node.js service built from `server.ts`; it serves authenticated `/api/*` routes and OAuth callbacks but does not start a Discord Gateway or scheduler. It must not be deployed on Lunafy.
- **Firestore:** shared persistent database and one-way bot-control queue. Bot and trusted API use Firebase Admin credentials only in their server environments.

The API is a necessary security boundary for the dashboard; GitHub Pages cannot call Firebase Admin or Discord privileged APIs directly. It validates each user's Discord permissions, signs authorized bot commands, and writes them to Firestore. The Lunafy bot polls and executes commands only for guilds in its Gateway session; no inbound Lunafy port is used. Live Discord/Firebase end-to-end testing is still required before production use.

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

## Separate trusted API service

Do not host the API on Lunafy. Use a separate persistent Node.js 22 service with the repository package files:

```sh
npm ci
npm run build:api
npm run start:api
```

Configure `NODE_ENV=production`, `PORT`, `APP_URL` (HTTPS API origin only), `ALLOWED_ORIGINS` (include the exact dashboard origin), `SESSION_SECRET` (32+ characters), `DATABASE_ADAPTER=firestore`, Firebase Admin credentials, `BOT_CONTROL_SECRET`, Discord OAuth client ID/secret, and the bot token for guild membership/permission verification. The bot token, OAuth client secret, Firebase Admin credentials, and control secret must remain server-side. The API never starts a Gateway; live operations are sent to the bot through the shared Firestore queue.

## GitHub Pages

1. Enable GitHub Pages with GitHub Actions as the source.
2. Set repository **variable** `VITE_API_BASE_URL` to the public HTTPS origin of the separate trusted API (origin only, no credentials or query string). It is configuration, not a secret.
3. The workflow supplies `VITE_BASE_PATH` from the repository name, executes `npm run build:dashboard`, and uploads `dist/`. No bot or Firebase credential is needed.
4. Configure the API's `ALLOWED_ORIGINS` for the published Pages origin. OAuth2 redirect URLs must target the trusted API's `/auth/callback`.

If `VITE_API_BASE_URL` is unset, the static build still succeeds, but authentication/data requests cannot reach an API. Pages deployment never builds or restarts the bot.

## Firebase setup

1. Create or select a Firebase project and enable a Firestore Native database.
2. Keep browser access denied. The dashboard has no Firebase client SDK authentication or direct Firestore operation; Admin SDK requests bypass Firestore Security Rules.
3. Create a server-side service identity with the minimum required Firestore IAM permissions.
4. Configure the three `FIREBASE_*` Admin values and the exact same `BOT_CONTROL_SECRET` in Lunafy and the trusted API host only. Never commit a service-account JSON file or place an Admin credential/control secret in a `VITE_` variable.
5. Firestore Admin SDK requests bypass Firestore Security Rules. Preserve the API's authentication, guild-ID validation, capability checks, command signatures, and audit writes; Firestore rules do not replace these controls.

## CI

GitHub Actions uses Node.js 22 and `npm ci`. Independent bot and dashboard jobs build without live Discord/Firebase credentials. A separate quality job runs `npm test`, `npm run lint`, `npm run security:check`, and `npm audit --audit-level=high`.
