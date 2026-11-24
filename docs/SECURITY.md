# Security Architecture – ShadowSlayers – Legends of Elements

## 1. Credential & Secret Boundaries
- **Frontend (GitHub Pages / Vite SPA)**: Zero private secrets. Never contains `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `FIREBASE_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `SESSION_SECRET`.
- **Trusted Backend (`server.ts` / Lunafy Node.js)**: All Discord Bot API requests, OAuth2 token exchanges, password verification, and privileged database mutations execute exclusively server-side.

## 2. Authentication & Session Model
- **Discord OAuth2 (Popup + State Verification)**:
  1. Dashboard requests `/api/auth/discord/url` (receives CSRF `state` bound on server).
  2. Popup opens Discord's `https://discord.com/oauth2/authorize` directly (works safely inside cross-origin iframes).
  3. `/auth/callback` verifies `state`, exchanges `code` server-side using `DISCORD_CLIENT_SECRET`, checks guild membership & highest role rank, issues an HMAC-signed session token, and notifies opener via `postMessage`.
- **First-Run Admin Claim Fallback (Zero Secrets Configured)**:
  - When `ADMIN_PASSCODE` is unset and no local admin hash exists, the login screen provides an inline one-time admin claim form.
  - Password is salted and hashed using Node `crypto.scryptSync` and stored server-side. Once claimed (or when `ADMIN_PASSCODE` env var is set), the bootstrap route locks permanently.
- **Session Transport**:
  - Client holds bearer token in React memory only (never `localStorage` or `sessionStorage`), paired with `Authorization: Bearer <token>` headers and `Origin`/`X-Requested-With` verification on mutations.

## 3. Role Hierarchy & RBAC
Clan rank hierarchy (`Shadow King` > `Shadow Council` > `Warlord` > `Elite Warrior` > `ShadowSlayer` > `Recruit`) is enforced server-side in `packages/permissions/src/hierarchy.ts`:
- Moderators cannot warn, timeout, kick, or ban members of equal or higher clan rank.
- Language roles (`English`, `Русский`, etc.) carry zero moderation privilege and remain completely independent of clan ranks.
- Ticket transcripts and `Inner Sanctum` configs require verified staff permissions.

## 4. Rate Limiting, Validation & AutoMod Safety
- All API endpoints validate request bodies with Zod (`packages/shared/src/validation.ts`).
- Per-IP sliding-window rate limiter guards `/api/auth/*` and mutation routes.
- AutoMod uses deterministic rules (never AI) and forbids automated permanent bans on uncertain triggers.
