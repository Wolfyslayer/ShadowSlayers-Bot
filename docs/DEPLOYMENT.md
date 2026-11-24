# Deployment & Operations Guide

## 1. Architecture Summary
- **Source of Truth**: GitHub repository
- **Bot & API Runtime**: Lunafy (Persistent Node.js) running `npm start` (`server.ts` + Discord Gateway)
- **Web Dashboard**: GitHub Pages static build (`npm run build` -> `dist/`)
- **Database**: Firebase Spark (Firestore) in production via server-side credentials, or `LocalPersistentAdapter` for standalone/preview execution

## 2. GitHub Pages Dashboard Setup
1. Set repository secret/variable `VITE_API_BASE_URL` to your Lunafy HTTPS API origin (e.g. `https://bot.yourdomain.com`).
2. Push to `main` — `.github/workflows/deploy-pages.yml` builds the React dashboard without any backend secrets and publishes `dist/` to GitHub Pages.
3. Add the GitHub Pages origin to `APP_URL` / CORS allowlist on your Lunafy backend.

## 3. Lunafy Persistent Bot & API Setup
1. Configure environment variables in Lunafy (never commit `.env`):
   - `PORT=3000`
   - `APP_URL=https://your-lunafy-domain`
   - `DISCORD_BOT_TOKEN=...`
   - `DISCORD_CLIENT_ID=...`
   - `DISCORD_CLIENT_SECRET=...`
   - `DISCORD_GUILD_ID=...`
   - `SESSION_SECRET=...` (strong 32+ byte random string)
   - `DATABASE_ADAPTER=firestore` (or `local` if testing)
2. Start command: `npm start` (runs unified `server.ts`, which launches Express API, persistent TaskScheduler, and the single Discord Gateway client).
3. If your Lunafy plan does **not** allow inbound HTTP connections, deploy only `npm run bot` on Lunafy and host the HTTP API + OAuth2 callback on Supabase Edge Functions (documented fallback).

## 4. Discord OAuth2 App Configuration
In Discord Developer Portal -> OAuth2 -> Redirects, add:
- `<YOUR_APP_URL>/auth/callback`
- `<YOUR_APP_URL>/auth/callback/`

## 5. Firebase Spark Setup (When Self-Hosted)
1. Enable Cloud Firestore on Firebase Spark (free tier).
2. Deploy `database/firestore.rules.template` as `firestore.rules` via `firebase deploy --only firestore:rules`.
3. Generate a service account key in Firebase Console (Project Settings -> Service Accounts -> Generate new private key).
4. Provide credentials to the Lunafy environment via:
   - `FIREBASE_PROJECT_ID=your-project-id`
   - `FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com`
   - `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
5. Set `DATABASE_ADAPTER=firestore`.

## 6. Command Registration Scope
- `DISCORD_COMMAND_SCOPE="auto"` (default): Registers guild commands instantly if `DISCORD_GUILD_ID` is numeric snowflake, else global.
- `DISCORD_COMMAND_SCOPE="guild"`: Forces immediate guild-scoped slash command registration.
- `DISCORD_COMMAND_SCOPE="global"`: Registers global commands across all guilds (may take up to 1 hour to propagate on Discord's edge cache).

## 7. CI Pipeline Discipline
- `.github/workflows/ci.yml` strictly runs `npm ci` using the committed `package-lock.json`.
- The pipeline executes:
  1. `npm ci` (exact dependency tree installation)
  2. `npm run security:check` (AI hygiene, secret leak checks, role integrity)
  3. `npm audit --audit-level=high` (dependency security audit)
  4. `npm run lint` (`tsc --noEmit` typecheck)
  5. `npm test` (unit and integration tests)
  6. `npm run build` (production Vite dashboard bundle)

