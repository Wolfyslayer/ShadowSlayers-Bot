# ShadowSlayers – Legends of Elements

Discord bot, trusted administration API, and static React dashboard backed by Firestore. The bot, API, and dashboard have separate entry points; the bot host runs no HTTP listener or frontend runtime.

## Local development (Windows PowerShell)

```powershell
git clone https://github.com/Wolfyslayer/ShadowSlayers-Bot.git
Set-Location ShadowSlayers-Bot
npm ci
Copy-Item .env.example .env
notepad .env
```

For bot development set `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID`. `DISCORD_GUILD_ID` is not required: the bot discovers all guilds where it is installed and registers guild commands for each. `DATABASE_ADAPTER=local` is suitable for isolated local bot tests; to make dashboard actions reach the bot, configure the same Firestore project and `BOT_CONTROL_SECRET` in both the API and bot environments.

Run each application in its own terminal:

```powershell
npm run dev:api
npm run dev:bot
npm run dev:dashboard
```

Run each command in its own terminal. For dashboard-to-bot actions, the API and bot must both use `DATABASE_ADAPTER=firestore`, the same Firebase project, and the same `BOT_CONTROL_SECRET`; `DATABASE_ADAPTER=local` is only for isolated development. The static dashboard needs a trusted API origin (`VITE_API_BASE_URL`) to authenticate or load data. Its build succeeds without that value or any Discord credentials; the dashboard is not usable on GitHub Pages until a compatible API service is configured.

Build and checks:

```powershell
npm run build:bot
npm run build:dashboard
npm test
npm run lint
npm run security:check
npm audit --audit-level=high
```

Tests use local fixtures and do not require live Discord or Firebase credentials.

## Deployment summary

- **Lunafy:** deploy the compiled bot only. On a build machine run `npm ci` and `npm run build:bot`; deploy `package.json`, `package-lock.json`, and `dist-bot/`. On Lunafy use Node.js 22, run `npm ci --omit=dev`, then `npm run start:bot`. Configure Firestore and Discord secrets in Lunafy; no inbound port is needed.
- **GitHub Pages:** `.github/workflows/deploy-pages.yml` builds and publishes only the static dashboard. Set the public repository variable `VITE_API_BASE_URL` to an HTTPS trusted API origin (not a secret). The build does not use bot credentials and does not restart the bot.
- **Trusted API:** `server.ts` is an API-only service for a separate host, not Lunafy. Build with `npm run build:api` and run `npm run start:api`; it does not start a Discord Gateway or scheduler. Authorized Discord-dependent actions are signed and sent through the shared Firestore command queue to the bot.
- **Firestore:** keep the Firebase Admin service-account values exclusively in trusted bot/API environment variables. Do not configure Admin credentials as `VITE_` variables.

See [deployment guide](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), and [security model](docs/SECURITY.md) for setup details and remaining live-service verification.
