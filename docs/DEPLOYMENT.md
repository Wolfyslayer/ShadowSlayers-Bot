# Deployment & Operations

## Architecture

- **Lunafy:** one persistent Node.js 22 process running the compiled Discord bot only. No Express, Vite, dashboard files, HTTP listener, inbound port, or scheduler API.
- **GitHub Pages:** static Vite dashboard only.
- **Trusted API:** separate Node.js service built from `server.ts`; it serves authenticated `/api/*` routes and OAuth callbacks but does not start a Discord Gateway or scheduler. It must not be deployed on Lunafy.
- **Firestore:** shared persistent database. Bot and trusted API use Firebase Admin credentials only in their server environments.

The API is a necessary security boundary for the current dashboard; GitHub Pages cannot call Firebase Admin or Discord privileged APIs directly. The API has not yet been connected to the Lunafy bot for Discord mutations, so operations requiring a live Discord Gateway fail closed. Do not treat the dashboard as production-complete until that control path is provided and verified.

## Windows local development (PowerShell)

```powershell
npm ci
Copy-Item .env.example .env
notepad .env
```

In `.env`, use `DATABASE_ADAPTER=local` for local tests, and configure `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, and numeric `DISCORD_GUILD_ID` before starting the live bot. Run separate terminals:

```powershell
npm run dev:bot
npm run dev:dashboard
npm run dev:api
```

The dashboard's `VITE_API_BASE_URL` should point to the API origin, e.g. `http://localhost:3000`. Builds and tests do not require Discord credentials:

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
- `DISCORD_GUILD_ID` (numeric guild snowflake)
- `DISCORD_COMMAND_SCOPE=auto` (or `guild` / `global`)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (newlines may be entered as `\n`)

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

Configure `NODE_ENV=production`, `PORT`, `APP_URL` (HTTPS origin only), `ALLOWED_ORIGINS` (include the exact GitHub Pages origin), `SESSION_SECRET` (32+ characters), `ADMIN_PASSCODE`, `DATABASE_ADAPTER=firestore`, Firebase Admin credentials, and Discord OAuth client ID/secret as needed. A Discord bot token may be needed for OAuth membership checks. Never expose these settings to the frontend. The service currently has no Gateway connection, so Gateway-dependent routes deliberately return unavailable; the service is not yet a full substitute for the former combined process.

## GitHub Pages

1. Enable GitHub Pages with GitHub Actions as the source.
2. Set repository **variable** `VITE_API_BASE_URL` to the public HTTPS origin of the separate trusted API (origin only, no credentials or query string). It is configuration, not a secret.
3. The workflow supplies `VITE_BASE_PATH` from the repository name, executes `npm run build:dashboard`, and uploads `dist/`. No bot or Firebase credential is needed.
4. Configure the API's `ALLOWED_ORIGINS` for the published Pages origin. OAuth2 redirect URLs must target the trusted API's `/auth/callback`.

If `VITE_API_BASE_URL` is unset, the static build still succeeds, but authentication/data requests cannot reach an API. Pages deployment never builds or restarts the bot.

## Firebase setup

1. Create a Firebase project and enable Cloud Firestore.
2. Review and deploy `database/firestore.rules.template`. It denies browser access by default; the current dashboard has no Firebase client SDK authentication or direct Firestore operation.
3. Create a server-side service identity with the minimum required Firestore IAM permissions.
4. Configure the three `FIREBASE_*` Admin values in Lunafy and the trusted API host only. Never commit a service-account JSON file or place an Admin credential in a `VITE_` variable.
5. Firestore Admin SDK requests bypass Firestore Security Rules. Preserve the API's authentication, guild-ID validation, capability checks, and audit writes; Firestore rules do not replace these controls.

## CI

GitHub Actions uses Node.js 22 and `npm ci`. Independent bot and dashboard jobs build without live Discord/Firebase credentials. A separate quality job runs `npm test`, `npm run lint`, `npm run security:check`, and `npm audit --audit-level=high`.
