# Security Architecture – ShadowSlayers – Legends of Elements

## 1. Credential & Secret Boundaries
- **Frontend (GitHub Pages / Vite SPA)**: Zero private secrets. Never contains `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `FIREBASE_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `SESSION_SECRET`.
- **Trusted Runtime**: `apps/bot/src/main.ts` runs on Lunafy and owns the Discord Gateway and Firestore Admin SDK. The separate `server.ts` API owns OAuth2 exchanges, admin-session verification, capability checks, and trusted database routes. The API is not deployed to Lunafy and currently does not have a control connection to the bot.

## 2. Authentication & Session Model
- **Discord OAuth2 (Popup + State Verification + Default-Deny)**:
  1. Dashboard requests `/api/auth/discord/url` (receives CSRF `state` with 5-minute TTL bound on server).
  2. Popup opens Discord's `https://discord.com/oauth2/authorize` directly (works safely inside cross-origin iframes).
  3. `/auth/callback` verifies `state`, exchanges `code` server-side, fetches `/users/@me` and `/users/@me/guilds` (plus live guild member roles via Bot REST when `DISCORD_BOT_TOKEN` is configured), and enforces `resolveAuthorizedDiscordOAuthSession()`: users lacking verified membership in `DISCORD_GUILD_ID` OR lacking an authorized leadership rank (`👑 Shadow King`, `🛡️ Shadow Council`, `⚔️ Warlord`, unless explicitly configured in `ADMIN_DISCORD_USER_IDS`) are **denied by default (HTTP 403)**.
  4. `postMessage` and CORS restrict origins explicitly to configured `APP_URL` / `ALLOWED_ORIGINS` (never wildcard `*`).
- **First-Run Admin Claim**:
  - The inline one-time claim remains available only outside production. Production startup requires an explicitly configured `ADMIN_PASSCODE`; the unauthenticated claim route returns 403 in production.
  - The unauthenticated claim route is also disabled for Firestore, even in development. On local JSON development only, the passcode is salted and hashed using Node `crypto.scryptSync` and stored locally.
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

## 5. Security & Authorization Hardening (Phase 0.3 Audit)
1. **Unranked Member Privilege Escalation Prevention**:
   - `resolveClanRankFromRoleNames(memberRoles)` matches strictly against canonical clan hierarchy roles (`👑 Shadow King` through `🌱 Recruit`).
   - Members with no clan role (or only holding language/class/notification/verification roles) are assigned `clanRank: null` (never `'🌱 Recruit'`).
   - Members with `clanRank: null` possess 0 clan capabilities and are blocked from executing privileged commands.
2. **Reflected XSS Sanitization in `/auth/callback`**:
   - Error messages returned in 403 HTML denial bodies are sanitized with `escapeHtml(authz.reason)` to prevent script injection.
3. **Dynamic Discord OAuth2 Session Re-verification (`revalidateDiscordOAuthSession`)**:
   - Session tokens are re-checked against live Discord member roles and guild membership on each authorized API request (or via 30s cached REST checks).
   - If a member is kicked, leaves the guild (404), or is demoted below leadership (`⚔️ Warlord`), access is revoked immediately with HTTP 403.
   - If a member is promoted to a higher clan rank, capabilities are dynamically updated in the session in memory.
4. **Route Parameter Validation (`safeIdSchema`)**:
   - Express router parameter guard (`app.param('guildId', ...)`) enforces `safeIdSchema` on all `/api/guild/:guildId/*` routes, rejecting directory traversal characters (`..`, `/`) and malformed IDs before database operations.
5. **Offline Discord Operation Safety**:
   - Actions requiring Discord state changes (moderation, role panel publishing, rules publishing, onboarding role assignments, language channel creation) require an active Discord Gateway connection.
   - If the bot is offline or Discord returns an error, the database state is preserved untouched and the request returns HTTP 503 or 502 with a failed-attempt audit log entry.

## 6. Guild, Firebase, and Deployment Boundaries
- The API validates `:guildId` and checks it against the authenticated session's guild ID before accessing a guild document. The dashboard uses the returned session guild ID rather than a hard-coded primary guild.
- Firebase Admin credentials are server-only. Firestore Security Rules deny client access by default; the dashboard has no Firebase client SDK or Firebase Auth identity, so no direct browser read/write path is currently permitted. Do not weaken rules to make the Pages app appear functional.
- Production API sessions require a configured `SESSION_SECRET`; production bot and API processes require Firestore. Configure the production initial admin password before deploying, because production first-run claim is disabled.
- `VITE_API_BASE_URL` is public origin configuration only, not a credential. The browser validates HTTPS (except localhost development) and rejects embedded credentials, query strings, and fragments. Never put private credentials in any `VITE_` variable.
- The GitHub Pages build is static and contains no Discord bot token, OAuth client secret, session secret, or Firebase Admin private key. The frontend build does not require Discord credentials.
- The separate API currently cannot perform live Gateway operations; the impacted routes must fail closed until a trusted bot-control mechanism is deployed. The API must never open a second bot Gateway on Lunafy.

