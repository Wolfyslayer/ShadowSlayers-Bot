# Security Architecture – ShadowSlayers – Legends of Elements

## 1. Credential & Secret Boundaries
- **Frontend (GitHub Pages / Vite SPA)**: Zero private secrets. Never contains `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `FIREBASE_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `SESSION_SECRET`.
- **Trusted Runtime**: `apps/bot/src/main.ts` runs on Lunafy and owns the Discord Gateway and Firestore Admin SDK. The separate `server.ts` API owns OAuth2 exchanges, session verification, capability checks, and trusted database routes. The API does not open a Gateway or run on Lunafy; live actions use signed Firestore commands executed by the bot.

## 2. Authentication & Session Model
- **Discord OAuth2 (Popup + State Verification + Default-Deny)**:
  1. Dashboard requests `/api/auth/discord/url` (receives CSRF `state` with 5-minute TTL bound on server).
  2. Popup opens Discord's `https://discord.com/oauth2/authorize` directly (works safely inside cross-origin iframes).
  3. `/auth/callback` verifies `state`, exchanges `code` server-side, fetches `/users/@me` and `/users/@me/guilds`, then intersects guilds where the user is an owner/Administrator/Manage Server with guilds where the bot is installed and the user still qualifies by live role permissions. The resulting signed session is guild-scoped and revalidated against Discord before each protected API operation.
  4. `postMessage` and CORS restrict origins explicitly to configured `APP_URL` / `ALLOWED_ORIGINS` (never wildcard `*`).
- **Sign-in**:
  - Dashboard authentication is Discord OAuth2 only; passcode claim and login routes are removed.
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
5. **API-to-Bot Command Boundary**:
   - The API verifies session guild access and action-specific Discord permissions before it writes a typed command to Firestore.
   - Commands and results carry HMAC signatures from `BOT_CONTROL_SECRET`; the bot rejects unsigned or modified commands, claims each queued job transactionally, and executes only allowlisted operations for a guild currently in its Gateway cache. The API verifies result signatures before trusting a completion.
   - Both services must use the same Firestore project and a server-only `BOT_CONTROL_SECRET` of at least 32 characters. Firestore Security Rules do not protect Admin SDK writes.
6. **Offline Discord Operation Safety**:
   - The API checks the bot's Firestore heartbeat and connected guild list. Stale/offline status returns HTTP 503 without queueing the operation.
   - Discord errors are returned as failed command results; API routes preserve or update database state only according to the actual command result. If the API times out after the bot claims a command, the action outcome is unknown; inspect Discord before retrying.

## 6. Guild, Firebase, and Deployment Boundaries
- The API validates `:guildId` and checks it against the authenticated session's guild ID before accessing a guild document. The dashboard uses the returned session guild ID rather than a hard-coded primary guild.
- Firebase Admin credentials are server-only. Firestore Security Rules deny client access by default; the dashboard has no Firebase client SDK or Firebase Auth identity, so no direct browser read/write path is currently permitted. Do not weaken rules to make the Pages app appear functional.
- Production API sessions require a configured `SESSION_SECRET`; production bot and API processes require Firestore and the shared bot-control secret.
- `VITE_API_BASE_URL` is public origin configuration only, not a credential. The browser validates HTTPS (except localhost development) and rejects embedded credentials, query strings, and fragments. Never put private credentials in any `VITE_` variable.
- The GitHub Pages build is static and contains no Discord bot token, OAuth client secret, session secret, or Firebase Admin private key. The frontend build does not require Discord credentials.
- The separate API never performs Gateway operations itself; the signed bot-control queue is the only path for dashboard actions that require Discord Gateway access. The API must never open a second bot Gateway on Lunafy.

