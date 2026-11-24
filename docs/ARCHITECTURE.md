# Architecture Overview – ShadowSlayers Bot

## 1. Hosting & Deployment Topology

| Component | Hosting Target | Responsibility |
| :--- | :--- | :--- |
| **Source of Truth** | GitHub | Source, docs, tests, migrations, Firestore rules, CI/CD |
| **Discord Bot** | Lunafy persistent Node.js 22 process | Discord Gateway, slash commands, event handlers, persistent scheduler |
| **Trusted API** | Separate persistent Node.js service (not Lunafy) | Bearer-session authentication, Discord OAuth callback, capability checks, validated Firestore Admin operations |
| **Primary Database** | Firebase Cloud Firestore | Shared persistence accessed by trusted Admin SDK code |
| **Dashboard** | GitHub Pages | Static React/Vite SPA; public backend origin via `VITE_API_BASE_URL` |

`apps/bot/src/main.ts` is the only Lunafy entry point. It opens no HTTP port and imports neither Express nor Vite. `server.ts` is an API-only service; it no longer starts the bot, scheduler, or static dashboard. The API dispatches Discord Gateway actions through a signed Firestore command queue to the standalone bot. The code path is implemented and locally tested, but the dashboard is not considered operational on GitHub Pages until the API, Firestore, OAuth, and bot are configured and live end-to-end behavior is verified.

## 2. Package & Directory Layout

```text
/
├── apps/
│   └── bot/src/              # Discord Gateway client, 39 slash commands, discovery, automod, xp, scheduler
├── packages/
│   ├── config/src/           # Safe env loading & validation
│   ├── database/src/         # DatabaseAdapter abstraction + LocalPersistentAdapter + guild seed
│   ├── localization/src/     # Deterministic non-AI multilingual engine & channel previewer
│   ├── permissions/src/      # Role hierarchy, clan vs language isolation, RBAC guards
│   └── shared/src/           # Shared TypeScript interfaces & Zod schemas
├── database/                 # Firestore Spark rules template & versioned schema migrations
├── docs/                     # Architecture, Database, Security, Deployment, Commands, Modules
├── src/                      # React + Vite Dark Fantasy Web Administration Dashboard
├── tests/                    # Automated Node test suite
├── .github/workflows/        # CI and GitHub Pages deployment workflows
├── server.ts                 # Trusted API only; deployed separately from Lunafy
└── apps/bot/src/main.ts      # Standalone bot executable
```

### Dashboard API endpoint audit

The browser uses the existing `/api/*` backend, not Firebase directly. **No current browser operation is approved for direct Firebase client SDK access**: the dashboard uses server-issued bearer sessions (not Firebase Auth), guild roles are derived from Discord, and `GuildState` is persisted as an Admin-managed document model. Direct reads/writes would bypass the current capability/session model or require a schema/rules/auth migration. Firestore rules deny access by default.

| Dashboard operation group | Classification | Trusted path / current limitation |
| :--- | :--- | :--- |
| `GET /api/health`, `GET /api/auth/status`, `GET /api/auth/me`, `GET /api/auth/guilds`, Discord OAuth2 routes | Trusted API | Discord-only authentication and guild-scoped authorization |
| `GET /api/auth/discord/url`, `GET /auth/callback` and `/auth/callback/` | Trusted API + Discord OAuth2/API | OAuth state, code exchange, user/guild/member checks stay server-side |
| `GET /api/guild/:guildId/state`; `POST /api/guild/:guildId/languages`; `PATCH /api/guild/:guildId/languages/:code/translations`; `POST /api/guild/:guildId/languages/:code/review`; `POST /api/guild/:guildId/languages/:code/toggle`; `PATCH /api/guild/:guildId/members/:userId`; `POST /api/guild/:guildId/role-panels`; `GET /api/guild/:guildId/onboarding`; `POST /api/guild/:guildId/appeals/:appealId/review` | Trusted API + Firestore Admin | Session guild binding, capability checks, validated backend mutations |
| `PUT /api/guild/:guildId/automod`; `POST /api/guild/:guildId/automod/test`; `POST /api/guild/:guildId/automod/false-positives`; `PATCH /api/guild/:guildId/automod/false-positives/:id`; `POST /api/guild/:guildId/custom-responses`; `DELETE /api/guild/:guildId/custom-responses/:id`; `PUT /api/guild/:guildId/logging/config` | Trusted API + Firestore Admin | Deterministic settings and reports; no direct client database access |
| `POST /api/guild/:guildId/tickets`; `POST /api/guild/:guildId/tickets/:ticketId/messages`; `POST /api/guild/:guildId/tickets/:ticketId/action`; `POST /api/guild/:guildId/recruitment/apply`; `POST /api/guild/:guildId/recruitment/:appId/review`; `POST /api/guild/:guildId/community/suggestions`; `POST /api/guild/:guildId/community/suggestions/:id/vote`; `POST /api/guild/:guildId/community/polls`; `POST /api/guild/:guildId/community/polls/:id/vote`; `POST /api/guild/:guildId/community/giveaways`; `POST /api/guild/:guildId/community/events`; `POST /api/guild/:guildId/community/announcements`; `POST /api/guild/:guildId/clan/games`; `PATCH /api/guild/:guildId/clan/games/:gameId`; `POST /api/guild/:guildId/clan/teams`; `POST /api/guild/:guildId/clan/raids`; `PATCH /api/guild/:guildId/settings`; `GET /api/guild/:guildId/backup` | Trusted API + Firestore Admin | Protected persisted operations; deployments must keep API credentials and sessions server-side |
| `POST /api/guild/:guildId/discovery/rescan`; `POST /api/guild/:guildId/discovery/confirm`; `POST /api/guild/:guildId/languages/:code/create-channels`; `POST /api/guild/:guildId/role-panels/:panelId/publish`; `POST /api/guild/:guildId/rules/publish`; `POST /api/guild/:guildId/onboarding/:userId/verify-rules`; `POST /api/guild/:guildId/onboarding/:userId/active-player`; `POST /api/guild/:guildId/moderation`; `POST /api/guild/:guildId/commands/execute` (for live commands) | Trusted API → signed Firestore command → bot Gateway | API session/capability checks precede enqueue; bot accepts only signed, typed commands for connected guilds and reports completion/failure |
| `POST /api/guild/:guildId/scheduler/tick` | Bot process only | API responds 503; persistent scheduled work is owned by the bot |

All dashboard API requests currently target these trusted routes; there is no static-only fallback or fabricated response. An API origin must be configured for a usable deployed dashboard.

## 3. Existing Discord Server Discovery Principle
Before any setup operation runs, `apps/bot/src/services/discovery.ts` scans the target guild against `packages/shared/src/legacy-template.ts`:
1. Matches all 9 legacy categories (`📜 01 — GATE OF SHADOWS` through `🏰 09 — CLAN VOICE`), 32 legacy text channels, 5 voice channels, uncategorized channels, and permission overwrites, while tracking optional extension channels (`📜・audit-logs`, `💡・suggestions`) separately.
2. Maps all 16 legacy roles (`👑 Shadow King` through `✅ Verified`) using exact match or single controlled alias, blocking automatic selection on ambiguous candidates (`conflicting`), and keeping `👑 Shadow King` manual-only (`excludeFromAutoSetup: true`).
3. Reports misplaced channels (`incorrectPlacements`), channel type mismatches (`incorrectTypes`), and permission drifts (`permissionDifferences`) without deleting, renaming, moving, or overwriting existing Discord resources. Only verified Discord API creations transition to `applied`. See `docs/LEGACY_COMPATIBILITY_AUDIT.md` and `docs/SETUP_MANAGER.md`.

## 4. Database Adapter & Concurrency Model (Phase 0.3)
- **`FirestoreDatabaseAdapter` (`packages/database/src/firestore-adapter.ts`)**:
  - Implemented via official Node.js Firebase Admin SDK (`firebase-admin`) for production Lunafy hosting.
  - Server-side only: uses service account credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`). Never exposes keys to browser code.
  - Guild isolation: root metadata stored in `shadowslayers_meta/root`, while each guild resides in `guilds/{guildId}`.
  - Subcollection isolation: high-frequency `logs` (`guilds/{guildId}/logs`) and dynamic `scheduledTasks` (`guilds/{guildId}/scheduledTasks`) are separated from the main guild document to prevent 1MB Firestore document limits and contention.
  - Bot control: the API writes signed jobs to `bot_control_commands/{commandId}`; the Gateway-owning bot transactionally claims and executes jobs for connected guilds, then signs results for API verification. `shadowslayers_meta/bot_runtime` contains the bot heartbeat and installed guild IDs. Both processes must share the same Firestore project and `BOT_CONTROL_SECRET`.
  - Concurrency safety: atomic Firestore transactions combined with per-guild in-memory asynchronous execution locks prevent race conditions where parallel operations (e.g., task status transitions and guild profile updates) could clobber each other.
  - Resiliency: automatic exponential backoff retries transient failures (`unavailable`, `deadline-exceeded`, `aborted`, `resource-exhausted`). Fatal credential/permission errors are immediately surfaced.
  - Explicit non-fallback: running with `DATABASE_ADAPTER=firestore` without credentials aborts startup. Running `DATABASE_ADAPTER=supabase` explicitly aborts as an unimplemented future adapter.

## 5. Discord Command & Interaction Pipeline (Phase 0.3)
- Complete Discord.js REST schemas (`buildDiscordSlashCommandsJson`) register typed Discord options (`String`, `Integer`, `User`, `Channel`, `Boolean`) with choices, min/max bounds, and required-before-optional parameter order.
- Top-level commands with multiple actions are structured into subcommands (`onboarding status`/`onboarding active_player`, `permissions matrix`/`permissions preview`, `roles list`/`roles publish`, `automod status`/`automod test`).
- Gateway interaction extraction (`extractDiscordInteractionArgs`) recursively flattens subcommands and extracts Discord snowflake IDs alongside display usernames.
- SHA-256 command payload hashing prevents redundant Discord REST API rate-limit exhaustion during bot startup.
- No configured guild ID is needed. The bot discovers installed guilds from its Gateway session, initializes each guild independently, and registers guild-scoped slash commands for those guilds.

