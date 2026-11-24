# Database Architecture – ShadowSlayers – Legends of Elements

## 1. Abstraction Strategy (Firestore First, No Silent Fallback)
All application modules read and write through the `DatabaseAdapter` interface in `packages/database/src/adapter.ts`.
- **Explicit Local Mode (`DATABASE_ADAPTER=local` -> `LocalPersistentAdapter`)**: Atomic JSON-backed store in `.data/shadowslayers-db.json` for local/preview development.
- **Production Primary (`DATABASE_ADAPTER=firestore`)**: Firebase Cloud Firestore using server-side Admin SDK credentials. Missing credentials fail startup; production bot/API processes require Firestore rather than local JSON.
- Supabase is not an implemented adapter and is not a supported deployment option.

The static dashboard currently has no Firebase client SDK or Firebase Authentication integration. All browser reads/writes go through the trusted API because the existing OAuth/passcode session and Discord role checks cannot be reproduced safely with the current Firestore document schema and rules. Firestore rules deny access by default; Admin SDK code bypasses those rules and must continue to enforce API authorization.

## 2. Core Collections (22 Structured Entities)
All collections enforce server-level isolation via `guildId` and consistent ISO-8601 timestamps (`createdAt`, `updatedAt`):

1. `servers` — Guild identity, owner ID, discovery snapshot, setup confirmation status
2. `serverConfigs` — Enabled modules, prefix/locale defaults, verification config, API settings
3. `members` — Guild membership state, clan rank, independent language role IDs, verification status, deletion-safe soft archive (`deletedAt`)
4. `memberProfiles` — XP, level, achievements, custom bio, activity counters, last XP timestamp
5. `roles` — Mapped Discord roles, hierarchy rank index, role panels (button/select/reaction), exclusive groups, temporary role grants
6. `languages` — Enabled/disabled state, flag emoji, native name, category/channel template naming, translation version, approval state
7. `translationResources` — Key-value string maps per language code (`en`, `ru`, `sv`, etc.), missing key diagnostics, reviewer metadata
8. `onboarding` — Localized welcome messages, rules text, verified role ID, protected leadership channel IDs
9. `moderationCases` — Sequential case IDs, action type, target, moderator, reason, duration, expiration, status, appeals
10. `warnings` — Member warning records linked to moderation case IDs
11. `logs` — Centralized searchable audit logs across 17 event categories + retention configuration
12. `tickets` — Sequential ticket numbers, categories, status (`open`, `claimed`, `closed`), assignee, transcript messages, feedback
13. `recruitmentForms` — Configurable application schemas (clan, staff, event)
14. `recruitmentApplications` — Submissions, answers, status (`pending`, `approved`, `rejected`), reviewer attribution
15. `suggestions` — Community proposals, voter IDs, status
16. `polls` — Question, options, vote counts, expiry
17. `giveaways` — Prize, winner count, entrants, winner IDs, end timestamp
18. `events` — Community & gaming events, RSVPs
19. `clanConfig` — Game-agnostic game definitions, gaming classes, hierarchy labels
20. `teams` — Clan squads, leaders, member rosters, raid/dungeon schedules, attendance records
21. `achievements` — Unlockable badges & criteria
22. `scheduledTasks` — Persistent idempotent task queue (`tempban_expiry`, `temprole_expiry`, `reminder`, `giveaway_draw`, `event_notify`, `birthday`, `scheduled_announcement`, `log_cleanup`, `inactivity_report`)

## 3. Migrations, Backups & Deleted Member Safety
- Schema versioning is tracked via `schemaVersion` and upgraded deterministically by `database/schema-migrations.ts`.
- Deleted Discord members retain historical moderation cases, ticket transcripts, and logs using immutable `userId` + cached `usernameSnapshot` (`isDeparted: true`) so audit trails never break.
- Backups: Export/import snapshot JSON via `/api/guild/:guildId/backup` (admin-only) or Firebase CLI / scheduled Firestore exports.

## 4. Production Firestore Implementation (`FirestoreDatabaseAdapter`)
- **Package**: `packages/database/src/firestore-adapter.ts`
- **SDK**: `firebase-admin` (Node.js official Firebase Admin SDK, server-side only).
- **Credentials**: Loaded from environment variables `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` (with `\n` normalization).
- **Document Model**:
  - `shadowslayers_meta/root`: Stores global database schema version (`schemaVersion: 3`) and salted/hashed admin credentials (`adminAuth`).
  - `guilds/{guildId}`: Stores core guild state (discovery mapping, modules, languages, members, role panels, onboarding config, automod rules, custom responses).
  - `guilds/{guildId}/logs/{logId}`: Subcollection storing structured audit log entries. Avoids Firestore 1MB document limit.
  - `guilds/{guildId}/scheduledTasks/{taskId}`: Subcollection storing pending and completed scheduler tasks.
- **Transactions & Concurrency**:
  - `saveGuild()` uses Firestore transactions to read existing scheduled tasks and merge them safely, preventing task regression (e.g., a completed or running task is never reverted to pending by a stale guild save).
  - An in-memory queue (`withGuildLock()`) ensures sequential execution per guild, preventing concurrent read-modify-write collisions.
- **Resilience**:
  - Automatically retries transient errors (`unavailable`, `deadline-exceeded`, `aborted`, `resource-exhausted`) with exponential backoff (default 3 retries).
  - Fatal authentication or permission errors reject immediately with descriptive logging.
- **Non-Fallback Policy**:
  - If `DATABASE_ADAPTER=firestore` is configured but credentials are missing, production startup throws an explicit fatal error (`Silent fallback to local JSON storage is forbidden in production`).
  - Setting `DATABASE_ADAPTER=supabase` throws an explicit startup error indicating that Supabase is an unimplemented future adapter.

## 5. Runtime Ownership and Verification
- Only the persistent bot process starts the scheduler. The standalone trusted API does not start a Discord Gateway or scheduler; its manual scheduler endpoint returns HTTP 503 rather than claiming work was executed.
- Guild-scoped API access is bound to the session's guild ID (or the configured default guild for legacy admin sessions), in addition to the session capability check.
- Schema migration runs when the Admin adapter initializes and reads a guild document. Automated migration/adapter tests use local fixtures and mocked Firestore interfaces; no live Firebase project was available for this phase.
- Failed audit-log or task-status writes for unknown guilds/tasks throw explicit errors instead of being silently dropped.

