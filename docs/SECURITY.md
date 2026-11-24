# Security Architecture – ShadowSlayers – Legends of Elements

## 1. Credential & Secret Boundaries
- **Frontend (GitHub Pages / Vite SPA)**: Zero private secrets. Never contains `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `FIREBASE_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `SESSION_SECRET`.
- **Trusted Backend (`server.ts` / Lunafy Node.js)**: All Discord Bot API requests, OAuth2 token exchanges, password verification, and privileged database mutations execute exclusively server-side.

## 2. Authentication & Session Model
- **Discord OAuth2 (Popup + State Verification + Default-Deny)**:
  1. Dashboard requests `/api/auth/discord/url` (receives CSRF `state` with 5-minute TTL bound on server).
  2. Popup opens Discord's `https://discord.com/oauth2/authorize` directly (works safely inside cross-origin iframes).
  3. `/auth/callback` verifies `state`, exchanges `code` server-side, fetches `/users/@me` and `/users/@me/guilds` (plus live guild member roles via Bot REST when `DISCORD_BOT_TOKEN` is configured), and enforces `resolveAuthorizedDiscordOAuthSession()`: users lacking verified membership in `DISCORD_GUILD_ID` OR lacking an authorized leadership rank (`👑 Shadow King`, `🛡️ Shadow Council`, `⚔️ Warlord`, unless explicitly configured in `ADMIN_DISCORD_USER_IDS`) are **denied by default (HTTP 403)**.
  4. `postMessage` and CORS restrict origins explicitly to configured `APP_URL` / `ALLOWED_ORIGINS` (never wildcard `*`).
- **First-Run Admin Claim Fallback (Zero Secrets Configured)**:
  - When `ADMIN_PASSCODE` is unset and no local admin hash exists, the login screen provides an inline one-time admin claim form.
  - Password is salted and hashed using Node `crypto.scryptSync` and stored server-side. Once claimed (or when `ADMIN_PASSCODE` env var is set), the bootstrap route locks permanently.
- **Session Transport**:
  - Client holds bearer token in React memory only (never `localStorage` or `sessionStorage`), paired with `Authorization: Bearer <token>` headers and `Origin`/`X-Requested-With` verification on mutations.

## 3. Role Hierarchy, Discord OR-Combination & RBAC
Clan rank hierarchy (`👑 Shadow King` > `🛡️ Shadow Council` > `⚔️ Warlord` > `🔥 Elite Warrior` > `🖤 ShadowSlayer` > `🌱 Recruit`) is enforced server-side in `packages/permissions/src/hierarchy.ts`:
- Moderators cannot warn, timeout, kick, or ban members of equal or higher clan rank; Discord bot role-position checks enforce `botHighestPosition > targetPosition`.
- Language roles (`🇬🇧 English`, `🇷🇺 Русский`), Class roles (`⚔️ Warrior`, `🔮 Sorcerer`, `🗡️ Swordsman`), and Notification roles carry zero moderation privilege and remain independent of clan ranks.
- Discord evaluates channel `Allow ViewChannel` overwrites via logical **OR** across roles; protected categories (`02`–`09`) explicitly deny `@everyone` `ViewChannel` so unverified members cannot bypass `📜 01 — GATE OF SHADOWS`, Class Halls stay isolated, read-only channels (`📜・rules`, `🏰・clan-announcements`, `📋・clan-roster`, etc.) deny ordinary member `SendMessages`, and `👑 07 — THE INNER SANCTUM` remains leadership-only.
- Automated setup never creates `👑 Shadow King` (`excludeFromAutoSetup: true`) and never auto-grants privileged permissions (`Administrator`, `ManageGuild`, `ManageRoles`, `BanMembers`).
- Ticket transcripts and `👑 07 — THE INNER SANCTUM` configs require verified leadership permissions.

## 4. Rate Limiting, Validation & AutoMod Safety
- All API endpoints validate request bodies with Zod (`packages/shared/src/validation.ts`).
- Per-IP sliding-window rate limiter guards `/api/auth/*` and mutation routes.
- AutoMod uses deterministic rules (never AI) and forbids automated permanent bans on uncertain triggers.
