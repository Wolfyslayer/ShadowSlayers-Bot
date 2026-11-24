# ShadowSlayers Legal Policy Audit

- **Status:** Internal preparation document; not a Terms of Service, Privacy Policy, or legal opinion
- **Audit date:** 2026-11-24
- **Repository:** `Wolfyslayer/ShadowSlayers-Bot`, branch `main`
- **Scope:** Tracked application source, configuration, workflows, and repository documentation. No production Discord application, Firebase project, hosting account, service logs, or operator records were inspected. No local `.env` values or credentials were read or copied.

This report records code-backed behavior for a later legal review. It separates implemented behavior from unknowns and incomplete work. It does not determine legal roles, lawful bases, or legal obligations. Confirm the open questions at the end before publishing public notices.

## 1. Identity, ownership, and audience

| Topic | Verified repository evidence | Not established by the repository |
|---|---|---|
| Product name | `package.json` is named `shadowslayers-bot`; `metadata.json` names the app **ShadowSlayers Bot** and describes a Discord administration bot/dashboard. | The Discord Developer Portal application name and application ID. `DISCORD_CLIENT_ID` is supplied through environment configuration; no application ID is hard-coded in tracked source. |
| Developer/owner | The repository is `Wolfyslayer/ShadowSlayers-Bot`. `README.md` calls it an independent community project and states it is not affiliated with or endorsed by any game publisher. | The responsible natural person or legal entity, postal address, jurisdiction, and person legally operating the service. A repository account is not proof of legal identity. |
| Website, support, contact | The README links to the GitHub repository. | No official product website, support-server invite, support email, privacy-request contact, or DPO contact was found in the repository. Do not treat the repository URL as a substitute without owner confirmation. |
| Public or selected servers | The bot code handles every guild in its Discord Gateway cache and processes `GuildCreate`; no guild allowlist is present. README says it discovers guilds where installed. Dashboard OAuth only offers guilds where the user is a guild owner or has Administrator/Manage Server permission and the bot is installed. | Whether the Discord application is publicly installable/listed, private, or restricted by Developer Portal settings. Those settings are outside this repository. |
| Age | No age gate, age declaration, or product age restriction was found. The schema has a birthday record with `month` and `day` only; no birth year or age calculation was found. | The age threshold the operator intends to apply and any jurisdiction-specific restrictions. Discord's own eligibility requirements are separate and must be checked against Discord's current terms. |
| Existing disclaimer | `README.md:5` says the project is independent, not affiliated with or endorsed by any game publisher, and that game names/trademarks belong to their owners. | No bot Terms of Service or Privacy Policy text was found. The README disclaimer is not a complete service policy. |

**References:** `package.json`; `metadata.json:1-9`; `README.md:1-12,44-47`; `packages/config/src/env.ts` (`DISCORD_CLIENT_ID`); `apps/bot/src/index.ts:1002-1058`; `server.ts:501-523,575-645`.

## 2. Implemented behavior versus incomplete or unverified work

### Implemented and verified from source

- Separate bot, trusted API, and static dashboard entry points are present. The bot starts the Discord Gateway and scheduler; `server.ts` starts an Express API; the dashboard calls that API. The bot entry point does not start Express.
- The bot requests Discord Gateway intents for guilds, guild members, guild messages, message content, message reactions, and voice states.
- The API implements Discord OAuth2 login, signed 12-hour application sessions, guild-scoped API routes, and live Discord guild permission checks.
- The database adapter has a server-side Firebase Admin / Firestore implementation and an explicit local JSON development adapter. Production startup requires Firestore; Supabase is rejected as unsupported.
- Guild configuration and member records are stored in guild-specific state. Firestore stores audit logs and scheduled tasks in guild subcollections and stores bot-control commands in a shared collection.
- The bot implements rule-based moderation/AutoMod, role and onboarding operations, moderation commands, tickets, recruitment, community features, and configurable game catalogs/rank/class labels. Game labels do not grant bot permissions.
- The dashboard's bearer token is kept in React memory. Its only observed `localStorage` use is the English/Swedish display-language preference.
- There is a manual backup-export route, but its current authorization/data scope is a material issue described in Sections 4 and 8.

**References:** `apps/bot/src/main.ts`; `apps/bot/src/index.ts`; `server.ts`; `src/App.tsx`; `src/lib/api.ts`; `packages/database/src/adapter.ts`; `packages/database/src/firestore-adapter.ts`; `packages/shared/src/types.ts`.

### Planned, incomplete, contradictory, or not live-verified

- No public Terms of Service, Privacy Policy, data-request workflow, or service contact details are implemented.
- The repository documents a separate API host, but does not provision one. No production API host, production Firebase project, project region, live Firestore rules deployment, or live OAuth configuration was inspected. `docs/DEPLOYMENT.md` identifies Cloud Run only as a possible host and explicitly says deployment is not configured/tested.
- The GitHub Pages workflow exists, but this audit did not verify a successful live deployment or connected production API.
- Firebase backup/export schedules and project retention controls are not configured in this repository. The database guide mentions Firebase CLI/scheduled exports, but no export schedule or backup policy is present in source configuration.
- Firestore logging has a `retentionDays` setting and `log_cleanup` task, but the Firestore adapter does not delete expired log subcollection documents. See Sections 4 and 8.
- `metadata.json:6` declares `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`, while `AI_WORKFLOW.md:3,32`, `ROADMAP.md:3`, and the implemented `package.json` dependencies/source describe or enforce no runtime AI. No Gemini/OpenAI SDK or runtime AI API call was found. Treat this as a metadata inconsistency; confirm whether it is stale or points to an out-of-repository integration before making any AI-provider statement.
- `voiceMinutes` and several log categories exist in the schema, but no voice-state, message-edit, or message-delete event handler that updates those fields/categories was found. Do not present them as active collection features without further verification.
- No bot installation URL or bot permission integer is configured in the repository. The actual Discord Developer Portal installation settings must be inspected before publishing a definitive permission list.
- A possible official website mentioned in prior project context is not linked or confirmed by tracked repository files; confirm whether `wolfyslayer.online` is the official site before using it as a policy host.
- Some repository security documentation describes protections not attached in the current API code (notably a per-IP rate limiter). Section 9 records these discrepancies.

## 3. Discord permissions, events, and functionality

### OAuth2 scopes and bot installation permissions

- The API constructs an OAuth2 authorization URL with exactly `scope: 'identify guilds'` (`server.ts:501-523`). It does not request `email`, `bot`, or `applications.commands` in this user sign-in flow.
- The callback exchanges the authorization code server-side and calls Discord `/users/@me` and `/users/@me/guilds` (`server.ts:540-578`). It then checks a guild against Discord and the bot's current guild/member/role API endpoints (`server.ts:130-164`).
- No bot invite URL containing `scope=bot`, `applications.commands`, or a `permissions=` bitfield was found. No Developer Portal install configuration is checked into the repository.
- `apps/bot/src/commands/registry.ts:672-712` sets `default_member_permissions` on some slash-command roots. These restrict which Discord members can invoke commands; they are **not** the bot's installation permission request.
- The bot code performs operations that require appropriate bot permissions in each server: read guild/channel/role/member data; create or edit channels, roles, and permission overwrites; send/reply to messages; manage roles; delete messages; and carry out configured moderation actions such as timeout, kick, ban, and unban. The minimum install permissions and actual granted permissions must be verified in the Discord application and each guild.

### Gateway intents and data access

`ShadowSlayersBotClient.start()` requests:

- `Guilds`
- `GuildMembers` (**privileged intent**)
- `GuildMessages`
- `MessageContent` (**privileged intent**)
- `GuildMessageReactions`
- `GuildVoiceStates`

It declares partials for messages, reactions, and users (`apps/bot/src/index.ts:1002-1011`). Deployment instructions explicitly say to enable Server Members and Message Content intents (`docs/DEPLOYMENT.md:52`).

The code registers handlers for client ready/error, guild create/delete, guild member update/remove, message reaction add/remove, interaction create, and message create (`apps/bot/src/index.ts:1017-1241`). In particular:

- `MessageCreate` handles non-bot messages in guilds. It reads author ID/username, message content, channel name, member role names, and mention counts for AutoMod/custom responses and XP (`apps/bot/src/index.ts:1241-1305`).
- Interactions read the invoking user ID/username, guild ID, member role names, locale, channel name, command name/options, and component custom IDs (`apps/bot/src/index.ts:1123-1238`).
- Reactions read user ID/username, message ID, channel name, and emoji for rules verification/role flows (`apps/bot/src/index.ts:1089-1122`).
- Guild discovery reads server structure and permissions. Individual member records are fetched by user ID in several operations. The source requests `GuildMembers`, but no unqualified bulk `members.fetch()` call was found; do not claim that the code explicitly downloads every member's profile as a separate bulk operation.
- Although `GuildVoiceStates` is requested, no `VoiceStateUpdate` handler was found; the schema's `voiceMinutes` field is initialized but no updater was found.
- No `MessageUpdate`, `MessageDelete`, presence, typing, or direct-message event handler was found. `GuildMessages` is the requested message intent; no direct-message intent is requested.

### Commands and administration

The implemented slash-command registry (`apps/bot/src/commands/registry.ts:141-622`) includes:

- General/server: `/help`, `/about`, `/bot-status`, `/profile`, `/userinfo`, `/avatar`, `/server`, `/serverinfo`, `/language`, `/onboarding`, `/modules`, `/dashboard`.
- Setup/permissions: `/setup`, `/config`, `/permissions matrix`, `/permissions preview`, `/rules publish`.
- Roles and AutoMod: `/roles list`, `/roles publish`, `/automod status`, `/automod test`, `/custom-response`, `/false-positive`.
- Moderation and appeals: `/warn`, `/warnings`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/tempban`, `/unban`, `/purge`, `/slowmode`, `/lock`, `/unlock`, `/modlog`, `/case`, `/appeal`.
- Community: `/suggest`, `/poll`, `/giveaway`, `/event`, `/remind`, `/recruitment`, `/ticket`, `/clan`, `/members`, `/leaderboard`, `/achievements`, `/activity`.

The dashboard API additionally handles guild discovery, languages/translations, member edits, moderation, AutoMod, logging, tickets, recruitment, community content, game configuration, teams/raids, settings, command execution, and backup export (`server.ts:680-2418`). It can perform destructive Discord actions such as moderation and message deletion where the invoking user's and bot's permissions allow it.

## 4. Data collected and processed

The table distinguishes transient processing from persistence. “Firestore” refers to the current production adapter's intended/configured data store, not proof that a live project is deployed.

| Data category | Exact fields or data observed | Purpose and source | Stored or temporary; location and retention behavior | Source references |
|---|---|---|---|---|
| Discord OAuth identity | Discord `id`, `username`, `avatar` (used to construct `avatarUrl`); application session fields: `userId`, `username`, `avatarUrl`, `provider`, `clanRank`, `guildVerified`, `guildId`, `authorizedGuildIds`, `discordRoleIds`, `permissions`, `lastVerifiedAt`, `expiresAt`. The callback initially sets `clanRank` to `null` and `discordRoleIds`/`permissions` to empty arrays. No email field is requested. | `/users/@me` response and the OAuth callback; used for dashboard identity and authorization. | OAuth response is processed in API memory. The app session is a signed bearer token passed to the browser and kept in React memory; it is not written to Firestore or browser storage. Token expires after 12 hours. | `server.ts:501-578,610-650`; `packages/shared/src/types.ts:744-758`; `src/App.tsx:110-150,200-213`. |
| OAuth guild list and live permission checks | OAuth guild entries: `id`, `name`, `owner`, `permissions`; live guild response: `id`, `name`, `owner_id`; member response: `roles`; role response: `id`, `permissions`. | Discord OAuth/API. Used to filter servers, verify the current user is a guild owner/Administrator/Manage Server, and select dashboard capabilities. | The OAuth guild list and live role/permission responses are processed in API memory. The selected/authorized guild IDs and names are returned in the session or from stored guild records; no separate global user-guild table is defined. | `server.ts:130-164,575-645,660-678`; `packages/permissions/src/discord-guild-access.ts`. |
| Command and interaction data | Invoking user ID/username, guild ID, command name, option names/values, component custom ID, locale, channel name, and derived actor rank. Bot-control jobs also hold typed operation/payload and actor fields (see queue row). | Discord interactions and API command-execution requests; required to authorize and execute commands. | Interaction objects are processed in memory. There is no generic command-usage analytics/history collection found. Some command actions create audit entries or persist their resulting moderation, ticket, community, or configuration records; API-to-bot commands are persisted in Firestore. | `apps/bot/src/index.ts:1123-1238`; `apps/bot/src/commands/registry.ts`; `server.ts:2383-2408`; `packages/shared/src/bot-control.ts`. |
| Guild identity and discovered server structure | `guildId`, `guildName`; discovery snapshot fields include `lastDiscoveredAt`, categories, channels, roles, IDs, names, types, positions, topics, role permission bitfields, channel permission overwrites, placements/types, proposed changes, counts, and setup confirmation actor/time. | Discord Guild/Channel/Role data obtained through Gateway discovery and API verification; used for dashboard management and setup comparisons. | Stored in `guilds/{guildId}` in Firestore (or the explicit local JSON database). Each guild has a separate state document. No `ownerId` field appears in `GuildState`. | `apps/bot/src/services/discovery.ts` (`discoverLiveDiscordGuild()`); `packages/shared/src/types.ts:20-140,680-719`; `packages/database/src/firestore-adapter.ts:241-318`. |
| Member profiles and activity | `userId`, `username`, `displayName`, `avatarUrl`, `clanRank`, `hasClanRank`, `languageCodes`, `gamingClasses`, `notificationRoles`, `verified`, `xp`, `level`, `messagesCount`, `voiceMinutes`, `achievements`, `customBio`, `lastXpAt`, `lastMessageHash`, `joinedAt`, `lastActiveAt`, `isDeparted`, `deletedAt`. Onboarding record: `userId`, `username`, `rulesVerified`, `rulesVerifiedAt`, `languageSelected`, `classSelected`, `notificationRolesCount`, `activePlayerRecruitGranted`, `activePlayerGrantedAt`, `discordScreeningCompleted`, `updatedAt`. | Discord member data, roles, reactions, commands, and message processing. Supports profiles, role/onboarding status, XP and levels. `lastMessageHash` is a 16-hex-character truncated SHA-256 hash of normalized content when XP is awarded. | Stored in the guild document's `members` and `onboardingRecords` arrays. On departure, a known record is marked `isDeparted=true`, rank/verification are cleared, and it is saved; the source does not set `deletedAt` or delete the record. `voiceMinutes` exists but no updater was found. | `packages/shared/src/types.ts:409-432`; `apps/bot/src/index.ts:758-785,1072-1076,1241-1305`; `apps/bot/src/services/xp.ts:8-19`. |
| Message content and moderation processing | Message content is read by `MessageCreate`; AutoMod keeps recent normalized message text in process memory for its 60-second repeat window. XP uses the content transiently and stores `lastMessageHash`, not the original text. False-positive records include `reporterUserId`, `reporterUsername`, `channelName`, `sampleContent`, `ruleHits`, `notes`, `status`, `reviewedBy`, `reviewedAt`, `createdAt`. | Discord guild messages and explicit false-positive reports/command submissions. Used for rule-based spam/link/word checks, configured responses, XP, and moderator review. | General message handling does not persist the full message body. The AutoMod recent-message map is process memory, not Firestore. A user-provided false-positive `sampleContent` is persisted in the guild state and has no separate deletion/retention rule found. | `apps/bot/src/index.ts:1241-1305`; `apps/bot/src/services/automod.ts`; `apps/bot/src/commands/registry.ts:1504-1518`; `packages/shared/src/types.ts:257-271` (`AutoModFalsePositiveReport`). |
| Moderation, warnings, and appeals | `ModerationCase`: `caseId`, `sequence`, `guildId`, `action`, `targetUserId`, `targetUsername`, `moderatorUserId`, `moderatorUsername`, `reason`, `durationMinutes`, `expiresAt`, `active`, `channelName`, `discordExecutionStatus`, `discordError`, `createdAt`. `WarningRecord`: `id`, `caseId`, `userId`, `username`, `moderatorUsername`, `reason`, `active`, `createdAt`. `ModerationAppeal`: `id`, `caseId`, `userId`, `username`, `reason`, `status`, `reviewerUsername`, `reviewNotes`, `createdAt`, `reviewedAt`. | Discord moderation commands and dashboard/API actions; records enforcement outcomes and appeals. | Stored in `guilds/{guildId}`. No general case/user deletion or data-subject erasure route was found. | `packages/shared/src/types.ts:305-346`; `server.ts:1463-1620`; `apps/bot/src/commands/registry.ts:346-483`. |
| Tickets and support messages | `TicketRecord`: `id`, `ticketNumber`, `category`, `subject`, `creatorUserId`, `creatorUsername`, `status`, `claimedByUserId`, `claimedByUsername`, `channelName`, `feedbackRating`, `feedbackComment`, `messages`, `createdAt`, `closedAt`. Each `TicketMessage` includes `id`, `authorId`, `authorName`, `authorRole`, `content`, and `createdAt`. | User ticket submissions and replies; used to provide support inside the guild. | Persisted in the guild state in Firestore/local JSON. No automatic ticket transcript expiry or deletion policy was found; closing a ticket archives it rather than erasing it. | `packages/shared/src/types.ts:496-513`; `server.ts:1801-1925`. |
| Recruitment and community submissions | `RecruitmentApplication`: `id`, `formId`, `category`, `applicantUserId`, `applicantUsername`, `answers`, `status`, `reviewerUserId`, `reviewerUsername`, `reviewNotes`, `createdAt`, `reviewedAt`. `SuggestionItem`: `id`, `authorId`, `authorName`, `title`, `description`, `status`, `upvotes`, `downvotes`, `createdAt`. `PollItem`: `id`, `question`, `authorName`, `options` (`id`, `label`, `voterIds`), `closed`, `endsAt`, `createdAt`. `GiveawayItem`: `id`, `prize`, `hostName`, `winnerCount`, `entrants`, `winnerIds`, `status`, `endsAt`, `createdAt`. `CommunityEvent`: `id`, `title`, `description`, `eventType`, `gameId`, `hostName`, `startsAt`, `maxParticipants`, `rsvps` (`userId`, `username`, `status`, `roleClass`), `createdAt`. | User submissions, votes, entries, event RSVPs, and administrator review. | Persisted in the guild document; no general deletion/expiry behavior found for these records. | `packages/shared/src/types.ts:472-560`; `server.ts:1926-2200`. |
| Other user-entered content/configuration | `CustomResponseRule`: `id`, `trigger`, `matchMode`, `response`, `enabled`, `languageCode`, `createdBy`, `createdAt`. `ReminderItem`: `id`, `userId`, `username`, `channelName`, `message`, `remindAt`, `completed`, `createdAt`. `ScheduledAnnouncement`: `id`, `title`, `channelName`, `languageCode`, `content`, `scheduledFor`, `sent`, `createdBy`. `BirthdayRecord`: `userId`, `username`, `month`, `day`. `ClanTeam`: `id`, `name`, `gameId`, `leaderUserId`, `leaderUsername`, `memberIds`, `description`, `maxSize`. `RaidSchedule`: `id`, `title`, `kind`, `gameId`, `teamId`, `leaderUsername`, `scheduledFor`, `status`, `attendance` (`userId`, `username`, `state`). Guild rules, welcome messages, translations, channel topics, form labels, and admin notes are also configurable text. | Admin and member submissions/configuration, processed by bot/API features. | Stored in the guild document or scheduled-task subcollection. These free-text fields may contain personal or sensitive content supplied by users; no content screening/redaction or category-specific deletion schedule was found. | `packages/shared/src/types.ts:246-265,561-640`; `server.ts` routes listed above. |
| Audit logs and operational errors | `AuditLogEntry`: `id`, `guildId`, `category`, `actorId`, `actorName`, `targetId`, `targetName`, `summary`, `details`, `createdAt`. Bot runtime: `connected`, `mode`, `botTag`, `guildCount`, `guildIds`, `lastError`, `startedAt`, `updatedAt`. Tasks also store `lastError`; moderation cases can store `discordError`. | Dashboard/bot actions, moderation, AutoMod, scheduler, and runtime failures. | Audit logs in `guilds/{guildId}/logs`; runtime status in `shadowslayers_meta/bot_runtime`; task errors in scheduled-task documents. Console output goes to service stdout/stderr. A 90-day logging setting exists, but Firestore cleanup is not effective as described in Section 8. | `packages/shared/src/types.ts:390-407,650-679`; `packages/shared/src/bot-control.ts` (`BotRuntimeSnapshot`); `packages/database/src/firestore-adapter.ts:294-318,691-705`; `apps/bot/src/main.ts`. |
| API-to-bot queue | `id`, `guildId`, `operation`, typed `payload`, `actorUserId`, `actorUsername`, HMAC `signature`, `status`, `createdAt`, `expiresAt`, worker/claim/completion fields, `result`, `resultSignature`, and `error`. | API sends authorized Discord work to the bot; the bot claims and executes jobs for connected guilds. | Stored in top-level Firestore collection `bot_control_commands`. Expired jobs are marked failed; no queue-document deletion/TTL cleanup was found. Payload/results may include user IDs, names, moderation reasons, channel/role data, or response text. | `packages/shared/src/bot-control.ts` (`BotControlCommand`); `packages/database/src/firestore-adapter.ts:552-649`; `server.ts` API mutation routes. |
| Global metadata/legacy authentication record | `shadowslayers_meta/root`: `schemaVersion`, `updatedAt`, optional `adminAuth` with `passwordHash`, `salt`, `claimedAt`, `username`. | Database schema metadata and legacy admin-auth storage. Current dashboard login uses Discord OAuth; no use of `adminAuth` from `server.ts` was found. | Firestore global metadata document (or local JSON root). No cleanup/migration removal for `adminAuth` was found. It is not returned by the current backup route. | `packages/shared/src/types.ts:724-734`; `packages/database/src/firestore-adapter.ts:241-259,322-350`; `server.ts:501-660,2411-2418`. |
| IP address and HTTP metadata | `req.ip` / `req.socket.remoteAddress` is read by a `rateLimit` helper. Request origin is read for CORS/OAuth startup. | Would support in-memory per-IP throttling and origin-bound OAuth. | The helper is defined but not attached to any route/middleware. No application request logger or persistent IP field was found. Hosting/network providers may separately record request metadata; actual provider and retention are unknown. | `server.ts:103-117,378-410,501-515`. |
| Browser preference | `shadowslayers-dashboard-locale` (`en` or `sv`). | Stores the dashboard's display language. | Browser `localStorage` only; no server or Firestore write. | `src/lib/LocaleProvider.tsx:17-24`. |
| Local development database | Full `DatabaseRoot` JSON, including guild state. | Explicit local adapter for isolated development/testing. | `.data/shadowslayers-db.json` by default, configurable via `LOCAL_DB_PATH`. This is not encrypted by application code; file-system protection is the operator's responsibility. Production startup requires Firestore. | `packages/config/src/env.ts`; `packages/database/src/adapter.ts` (`LocalPersistentAdapter`). |

### Message and interaction logging limits

The general `MessageCreate` handler processes message text, but does not create a full message-content archive. The schema contains log categories such as `message_edit`, `message_delete`, and `voice_activity`; the current bot listener set does not include message edit/delete or voice-state events. Do not state that the bot currently stores those event contents based only on the category names.

## 5. Database, access boundaries, and backups

### Firestore document model

The Admin SDK adapter currently uses these paths:

- `shadowslayers_meta/root`: `schemaVersion`, `adminAuth`, `updatedAt`. `adminAuth`, if present, has `passwordHash`, `salt`, `claimedAt`, and `username` (`packages/shared/src/types.ts:724-734`). The current dashboard OAuth flow does not use this record.
- `guilds/{guildId}`: one serialized `GuildState` containing identity, discovery, modules, languages/translations, onboarding, members, moderation, tickets, recruitment, community, game configuration, and other feature state (`packages/shared/src/types.ts:680-723`).
- `guilds/{guildId}/logs/{logId}`: structured audit entries.
- `guilds/{guildId}/scheduledTasks/{taskId}`: scheduled-task documents.
- `shadowslayers_meta/bot_runtime`: current bot status and connected guild IDs.
- `bot_control_commands/{commandId}`: signed work/result records with `guildId` and actor attribution.

The guild document is partitioned by Discord guild ID. A user's ID may occur independently in multiple guild documents; there is no central cross-guild member profile. The global control queue and metadata documents are shared. The backup-export endpoint currently violates this practical isolation boundary (see below).

### Rules, credentials, region, encryption, and backups

- The Firestore adapter uses `firebase-admin` and service-account configuration supplied at runtime; Firebase Admin credentials are not meant for frontend code. Admin SDK access bypasses Firestore Security Rules.
- `database/firestore.rules.template` is a template, not proof of deployed rules. It defines a deny-all fallback and some Firebase-Auth-based guild staff/admin paths. The current dashboard does not use the Firebase client SDK or Firebase Authentication; it uses Discord OAuth and the trusted API. The template's deployed status and compatibility with the actual document model are unknown.
- Each `guilds/{guildId}` document's top-level `GuildState` fields are `schemaVersion`, `guildId`, `guildName`, `discovery`, `modules`, `languages`, `translations`, `onboarding`, `onboardingRecords`, `customResponses`, `falsePositiveReports`, `rolePanels`, `temporaryRoles`, `moderationCases`, `warnings`, `appeals`, `automod`, `logging`, `logs`, `members`, `progression`, `achievements`, `recruitmentForms`, `recruitmentApplications`, `tickets`, `ticketSequence`, `caseSequence`, `suggestions`, `polls`, `giveaways`, `events`, `reminders`, `birthdays`, `challenges`, `scheduledAnnouncements`, `games`, `gamingClasses`, `teams`, `raidSchedules`, `scheduledTasks`, and `updatedAt` (`packages/shared/src/types.ts:680-722`).
- No Firebase project ID value, Firestore location/region, deployed rules version, CMEK setting, backup schedule, or Google Cloud project configuration is present in tracked source. The actual project location must be checked in Firebase/Google Cloud before making a residency claim.
- No application-layer encryption of guild fields is implemented. Firebase/Google Cloud describes default encryption for stored customer content; verify the current provider configuration and applicable Firestore transport protections for the selected project. Local JSON files have no application encryption.
- `GET /api/guild/:guildId/backup` requires a guild-scoped `settings.manage` session but calls `db.exportSnapshot()` and returns `snapshot.guilds` for **all guild IDs** (`server.ts:2411-2418`; `packages/database/src/firestore-adapter.ts:708-729`). A manager authorized for one guild can therefore obtain other guilds' exported state, including each guild's latest 500 audit logs and all scheduled tasks loaded by `getGuild()`. The route omits `snapshot.adminAuth` and the separate `bot_control_commands` collection, but the cross-guild data exposure remains. Do not promise guild-isolated backups until this is corrected and tested.
- The route is an export only; no backup import route or automated backup lifecycle was found. The documented Firebase CLI/scheduled export option is operator guidance, not an implemented schedule.

## 6. Third-party services and processors

| Service | Data shared/processed and purpose | Essential or optional | Repository evidence / provider references |
|---|---|---|---|
| Discord API, OAuth2, Gateway, and CDN | OAuth identity and guild list; bot/API guild, member-role, channel/role data; message content and interactions available under enabled intents; moderation/role/channel actions; avatar URLs/images. | Essential for bot and Discord login/features. | `server.ts`, `apps/bot/src/index.ts`. Discord Privacy Policy: <https://discord.com/privacy>. OAuth2 documentation: <https://discord.com/developers/docs/topics/oauth2>. Verify current policy version before publication; the provider page retrieved during this audit displayed a future effective date relative to the audit date. |
| Firebase / Google Cloud Firestore | Guild state, member records, moderation/tickets/community content, logs, tasks, runtime status, and bot-control queue. Service-account credentials authorize trusted server processes. | Essential for the documented production architecture; local JSON is an explicit development-only alternative. | `packages/database/src/firestore-adapter.ts`; `packages/config/src/env.ts`. Firebase privacy information: <https://firebase.google.com/support/privacy>. Google Cloud privacy notice: <https://cloud.google.com/terms/cloud-privacy-notice>. Default encryption documentation: <https://cloud.google.com/docs/security/encryption/default-encryption>. Firestore Security Rules: <https://firebase.google.com/docs/firestore/security/get-started>. |
| Lunafy hosting | The deployment documentation assigns the persistent Discord bot process to Lunafy. The host necessarily receives deployment artifacts and runtime configuration; its platform logs may receive process output and network metadata. | Intended/essential for the documented bot deployment, but actual account/service operation was not inspected. | `README.md:44-47`; `docs/DEPLOYMENT.md`. Provider legal name, privacy URL, region, log retention, and processing terms are not identified in the repository. |
| GitHub Actions and GitHub Pages | GitHub Actions checks out repository source, installs npm dependencies, builds the static dashboard, and publishes `dist`. Pages serves frontend assets to browsers. | Current configured CI/static-hosting path; whether it is live is unverified. | `.github/workflows/ci.yml`; `.github/workflows/deploy-pages.yml`. GitHub General Privacy Statement: <https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>. |
| Separate API hosting provider | The API is a normal Node/Express service and must be hosted separately. The repository names Cloud Run as one possible option, not an active deployment. | Required for a functional hosted dashboard, but provider is not selected/verified in this repository. | `docs/DEPLOYMENT.md`; `server.ts`. If Cloud Run is selected, Google Cloud privacy terms also apply. |
| npm registry/build infrastructure | CI/development installs dependencies using `npm ci`; no runtime transfer of end-user data to npm was found. | Build-time only. | `package.json`, `package-lock.json`, GitHub workflows. |
| Analytics, telemetry, external logging, or AI provider | No analytics SDK, external error-monitoring SDK, or runtime AI client/API call was found. Runtime errors are written to stdout/stderr and selected Firestore audit/task/runtime fields. `metadata.json` has the contradictory Gemini capability flag described above. | No verified runtime provider. | `package.json`, `server.ts`, `apps/bot/src/main.ts`, `metadata.json`, `AI_WORKFLOW.md`. |

No separate payment, advertising, email, analytics, or customer-support processor integration was found. The eventual API host and hosting-provider logs remain unknown until deployment.

## 7. OAuth2 and account security

1. The dashboard calls `GET /api/auth/discord/url`. The API requires a configured client ID/secret and an allowed dashboard origin, creates a random state value, binds it to the target origin, and expires it after five minutes (`server.ts:501-524`).
2. Discord redirects to the trusted API `/auth/callback`. The API validates/consumes state, exchanges the authorization code server-side, and requests `/users/@me` and `/users/@me/guilds` with the returned access token (`server.ts:526-578`).
3. The callback keeps guilds where the user is owner/Administrator/Manage Server and the bot can verify current membership/roles; authorized guild ID/name data is used to initialize or update guild state (`server.ts:575-608`).
4. The API signs an application bearer token with HMAC-SHA256. Its claims include user identity/avatar, selected and authorized guild IDs, and a 12-hour expiry. The browser receives it by `postMessage` to the state-bound origin. The token is held in React state and sent as an `Authorization: Bearer` header (`server.ts:610-650`; `src/App.tsx`; `src/lib/api.ts`).
5. Protected requests validate the signed token and make a live Discord bot-token check for the requested guild/user, then enforce action-specific Discord permission checks (`server.ts:405-447`; `packages/permissions/src/discord-guild-access.ts`). The code's active route authorization is based on current Discord owner/Administrator/Manage Server permissions and capability-specific Discord permissions. The separate `resolveAuthorizedDiscordOAuthSession()` helper is not called by `server.ts`; do not rely on repository security prose that describes a different in-guild clan-rank OAuth gate.

**Token storage and revocation**

- The Discord OAuth access token is used in memory for the two Discord user API calls and is not written to Firestore, a cookie, or browser storage. The callback only types/uses `access_token`; it does not persist or refresh an OAuth token. No refresh flow was found.
- The application bearer token is not a Discord token. It is signed by the API and expires after 12 hours. There is no server-side session registry or application logout/revoke endpoint.
- Dashboard logout clears React state only (`src/App.tsx:200-213`). It does not revoke a signed token already copied elsewhere; such a token remains valid until expiry unless its permissions cease to pass the live Discord check or the API session secret is rotated.
- No application-specific Discord token revocation call was found. Users may revoke OAuth authorization through Discord account controls, but the API does not retain/recheck the OAuth access token; a previously issued app session may continue until expiry if the user still passes the live guild permission checks. The operator should verify and explain the current Discord revocation workflow.
- OAuth state and the live access cache are in process memory. OAuth state is consumed during callback; its five-minute expiry is checked on callback, but no proactive cleanup of unused expired map entries was found. No persistent session store is used.

**References:** `server.ts:73-164,184-205,378-447,501-660`; `packages/config/src/env.ts`; `packages/shared/src/types.ts:744-759`; `src/App.tsx:110-150,200-213`; `src/lib/api.ts`; `docs/SECURITY.md` (cross-check against the code, not as sole evidence).

## 8. Retention and deletion behavior

| Event/request | Observed behavior |
|---|---|
| Server removes the bot | `GuildDelete` updates the bot's runtime guild count/status only. It does not delete `guilds/{guildId}`, logs, tasks, member profiles, or queued commands. Guild data remains in storage. |
| Member leaves or is removed | For an existing tracked record, `GuildMemberRemove` sets `isDeparted=true`, clears rank/verification, and saves it. It does not remove the record or set `deletedAt`; historical cases/logs remain linked to the user ID. |
| Discord account is deleted | No Discord account-deletion event or webhook handler was found. Existing member, moderation, ticket, log, and submission records are not automatically removed when an account is deleted. |
| Administrator wants to delete a guild configuration | No guild-deletion API route or adapter method used by the application was found. The Firestore reference interface has a `delete()` method, but the production adapter does not call it for guild cleanup. The only API `DELETE` route found deletes a custom-response rule. |
| User logs out/disconnects from dashboard | React state is cleared; no server-side bearer-token revocation or Discord OAuth token revocation is performed. |
| User requests access/correction/deletion | No data-subject-request endpoint, contact workflow, or user-wide data deletion function was found. Some administrator routes edit selected member fields; this is not a user-facing correction/deletion workflow. |
| Bot/API process shuts down | Persistent guild data remains. Bot shutdown updates runtime status; it does not purge database records. |
| Scheduled tasks expire | Queue commands are marked failed when expired, but no Firestore TTL or deletion of old command documents was found. Completed/failed task and queue records have no general expiry cleanup in the adapter. |
| Audit-log retention | Seed default is 90 days (`packages/database/src/seed.ts:404`). The local JSON adapter prunes logs on append and caps them at 1,500 (`packages/database/src/adapter.ts:136-154`). Firestore stores logs in `guilds/{guildId}/logs`; `getGuild()` reads at most the newest 500. The scheduler's `log_cleanup` filters the in-memory `guild.logs`, but Firestore `saveGuild()` only writes the parent state/tasks and never deletes old log subcollection documents. Thus the configured 90-day setting does not currently delete old Firestore log documents. |
| Backups | A manually callable JSON export exists. It is not a scheduled backup and, due to the all-guild scope issue in Section 5, can export all guild states to an administrator authorized for one guild. No import or backup deletion/retention workflow was found. |
| Local development data | Local JSON data persists at `LOCAL_DB_PATH` (default `.data/shadowslayers-db.json`) until manually removed. No automatic local file purge or encryption is implemented. |

**References:** `apps/bot/src/index.ts:1065-1076`; `packages/database/src/adapter.ts:136-154`; `apps/bot/src/services/scheduler.ts:119-133`; `packages/database/src/firestore-adapter.ts:294-318,362-370,453-470,708-729`; `server.ts:1758-1774,2411-2418`; `packages/shared/src/types.ts:409-432`.

## 9. Security measures and known limitations

### Implemented controls

- OAuth state validation, exact configured dashboard origins for OAuth start, HMAC-signed sessions, session expiry, and bearer-token validation.
- Guild-scoped protected routes; current live Discord owner/Admin/Manage Server and capability-specific permission checks; safe guild-ID validation.
- API request JSON body limit of 1 MB, explicit CORS response allowlist, and Zod validation schemas on many mutating routes.
- Production API checks for HTTPS `APP_URL`, a configured `SESSION_SECRET` of at least 32 characters, Firestore adapter selection, and a 32-character minimum bot-control secret. The bot requires a Discord bot token/client ID and Firestore in production.
- API-to-bot commands and results use HMAC signatures; Firestore transactions claim commands and prevent stale task state from reverting completed work.
- Firestore Admin credentials are server-side environment configuration; frontend security checks/workflows verify private credential strings are not bundled.
- The bot validates role hierarchy and uses live Discord actions; AutoMod filters its automated actions and forbids automatic permanent bans.

### Limitations and discrepancies requiring owner/developer action

1. **Cross-guild backup export:** a guild-scoped `settings.manage` caller receives all guild states from `/api/guild/:guildId/backup`. This contradicts the intended guild isolation and must be resolved before claiming that guild administrators can export only their own guild's data. The returned object currently excludes `adminAuth`, but includes other guild states.
2. **Rate limiting:** `server.ts` defines a per-IP `rateLimit()` helper and IP bucket map (`server.ts:73,103-117`), but a repository search found no invocation or middleware attachment. `docs/SECURITY.md` claims that it guards auth/mutation routes; that claim is not verified by current code. The helper's IP value is not persisted.
3. **Origin checks:** CORS adds response headers for configured origins; it is not a general request rejection mechanism. The browser sends `X-Requested-With`, but no server-side check of that header was found. Protected routes still require bearer authentication and authorization. Do not describe CORS as the sole authorization/CSRF control.
4. **Firestore rules:** the checked-in rules are a template, and Admin SDK bypasses them. Actual deployed rules/identity configuration are unknown.
5. **Log retention:** Firestore subcollection logs are not deleted by the configured cleanup path (Section 8). Do not promise a 90-day deletion period for Firestore logs.
6. **Session revocation:** logout is client-side only; signed tokens have no server-side revocation list. Live permission checks mitigate changed guild permissions, but do not invalidate a copied token immediately when a user simply clicks logout.
7. **Error logging:** API and bot errors are written to stdout/stderr; bot runtime/task/audit records may persist error messages. No redaction policy, log sink, provider retention, or access policy is configured in the repository.
8. **Deployment controls:** production TLS termination, hosting access logs, backups, region, DPA, and infrastructure IAM are provider configuration, not established by this code.

`docs/SECURITY.md` also describes all API endpoints as Zod-validated and says mutation requests verify Origin/`X-Requested-With`. Treat those as documentation assertions, not as confirmed facts for every route; inspect each route and actual deployed middleware before repeating them publicly.

## 10. Terms of Service considerations supported by the code

These are operational facts, not proposed contractual language:

- Moderation commands and dashboard actions can warn, timeout, kick, ban, tempban, unban, purge messages, change slowmode, and lock/unlock channels when the user and bot have sufficient permissions.
- AutoMod uses configured deterministic rules for spam/repetition, mentions, invites, configured suspicious domains, and blocked words. It can delete a message when configured, and the source limits automated actions to configured safe actions; it does not automatically issue a permanent ban.
- Server setup describes itself as non-destructive and requires administrator confirmation for Discord structure changes. This does not make all other bot features non-destructive.
- The bot and dashboard depend on Discord, Firestore, API hosting, and the bot host. There is no uptime guarantee, SLA, support promise, warranty, or availability commitment in the repository.
- No implemented service-level suspension, global user ban, abuse-report review process, or appeal of service suspension was found. Guild moderation and a guild ticket category named `report` are separate from a report process for abuse of the ShadowSlayers service; Discord platform enforcement is also separate.
- The repository does not capture acceptance of service terms, set acceptable-use conditions for the service, or define the operator's right to suspend/remove a server.
- Default server rule text and AutoMod configuration are guild/server features, not ShadowSlayers service Terms of Service.
- The existing game non-affiliation and trademark disclaimer is in `README.md:5`. It does not establish a general service disclaimer.

Owner must decide and have counsel review acceptable use, abuse/spam/disruption handling, suspension/termination, service changes/availability, third-party dependencies, server-admin responsibilities, and liability/disclaimer terms. None should be represented as already implemented policy.

## 11. Privacy/GDPR preparation

- **Potential controller:** likely the person/entity that determines the purposes and means of operating ShadowSlayers Bot, not automatically Discord, Firebase, or the GitHub repository owner. The legal identity, Swedish/EU establishment, address, and controller role are not established in the repository. If the owner-provided Sweden/EU premise is correct, confirm the applicable establishment and contact details with counsel.
- **Potential processors/independent providers:** Discord processes Discord accounts and platform data under its own terms; Firebase/Google Cloud processes stored application data under the selected account/project; GitHub processes repository/CI/Pages data; Lunafy and the eventual API host process runtime/deployment data. Contractual roles, DPAs, regions, subprocessors, and transfer terms are not in the repository.
- **Legal basis:** none is explicitly identified by code or project documentation. Discord OAuth consent is not by itself a complete determination of the operator's GDPR legal basis for all processing. The operator must determine and document a basis per purpose and decide whether any consent/notice is required.
- **Data subject access/correction:** a guild administrator can read guild data in the dashboard and request a backup. The backup scope is currently cross-guild, not a safe scoped rights export. Some member fields can be edited by authorized administrators; no dedicated identity verification or subject-request process exists.
- **Erasure:** no user-level or guild-level erasure workflow was found. Departed members are soft-archived and retained. Guild removal does not purge stored guild data. Audit logs, tickets, moderation, queue and backups lack a general deletion procedure.
- **Portability:** the administrator backup route returns JSON, but it is guild-unscoped as described above; no user-specific portable export exists.
- **Retention:** no complete retention schedule exists. The 90-day log setting is not enforced against Firestore log subcollection documents. Other guild records have no code-backed expiry/deletion schedule.
- **International transfers and residency:** Firestore region, hosting regions, GitHub/Discord processing locations for these users, and any transfer mechanism are not specified by the repository. Confirm actual provider project settings/contracts and the current data locations.
- **Special-category/free text:** the bot is not shown to request sensitive-category data, but free-text fields (tickets, appeals, recruitment answers, bios, suggestions, messages, and notes) can contain user-supplied personal or sensitive information. There is no field-level classification or redaction mechanism.
- **Privacy requests/contact:** no privacy email, form, support server, DPO, or complaint/escalation contact was found.

No legal basis, controller identity, retention period, international transfer position, or rights-handling commitment should be invented from these technical facts.

## 12. Owner confirmation checklist

- [ ] What is the legal name of the controller/operator, registered or contact address, country of establishment, and responsible contact?
- [ ] What official public website, support-server invite, and support/privacy contact email should users use?
- [ ] Is `wolfyslayer.online` the official ShadowSlayers website, and will the public legal pages be hosted there?
- [ ] What is the Discord application's official name and application/client ID? Is the application public, private, or limited to selected servers?
- [ ] After publication, which ToS and Privacy Policy URLs will be entered in the Discord Developer Portal?
- [ ] What bot installation scopes and permission integer are configured in the Discord Developer Portal? Which privileged intents have been approved/enabled?
- [ ] What minimum age applies, including any regional requirements, and where will that be enforced/notified?
- [ ] Is any Gemini/AI capability actually used outside this repository? If not, who will correct `metadata.json`'s Gemini capability flag?
- [ ] Which Firebase project and Firestore region are used in production? What exact Security Rules are deployed? Which Google Cloud account/region stores backups?
- [ ] Are backups enabled? What data do they contain, how long are they retained, who can restore/delete them, and where are they stored?
- [ ] Which hosting providers actually run the bot and API? Is Lunafy the selected provider? What provider privacy notices, DPAs, regions, log retention, and subprocessors apply?
- [ ] Are production API access logs, reverse-proxy logs, Discord logs, or Cloud logs enabled? Do any retain IP addresses, request headers, or response/error bodies, and for how long?
- [ ] Will the cross-guild backup scope be corrected before launch? What process will provide an authenticated, guild- and subject-scoped export?
- [ ] Will Firestore log cleanup be corrected, and what retention periods apply separately to member profiles, tickets, appeals, recruitment, messages, moderation records, audit logs, scheduler jobs, command queue, and backups?
- [ ] How can a user request access, correction, restriction, objection, erasure, or portability? How will identity and guild authority be verified, and what contact will receive requests?
- [ ] What should happen to records when a server removes the bot or an administrator deletes a server configuration? Who carries out deletion, including Firestore subcollections, command records, logs, and backups?
- [ ] Which GDPR legal basis applies to each processing purpose? Are any fields likely to contain special-category data, and what restrictions/notices are needed?
- [ ] What international transfer safeguards and contractual terms apply to Discord, Google/Firebase, GitHub, Lunafy, and the selected API host?
- [ ] What service policies will apply for acceptable use, abuse, suspension/removal, availability, changes, server-admin responsibilities, and third-party platform outages?
- [ ] Does the legacy `shadowslayers_meta/root.adminAuth` record exist in the production database, and if so, why is it retained when the current login flow uses Discord OAuth?

## 13. Source and provider reference index

Primary implementation references:

- Identity and runtime configuration: `README.md`; `metadata.json`; `package.json`; `packages/config/src/env.ts`.
- OAuth, API authorization, request handling, and API routes: `server.ts`; `packages/permissions/src/discord-guild-access.ts`; `packages/permissions/src/oauth-authz.ts`.
- Bot intents, Gateway events, message handling, and startup: `apps/bot/src/index.ts`; `apps/bot/src/main.ts`; `apps/bot/src/commands/registry.ts`; `apps/bot/src/services/automod.ts`; `apps/bot/src/services/xp.ts`.
- Data fields: `packages/shared/src/types.ts`; `packages/shared/src/bot-control.ts`.
- Persistence, migrations, retention: `packages/database/src/adapter.ts`; `packages/database/src/firestore-adapter.ts`; `packages/database/src/seed.ts`; `database/schema-migrations.ts`; `apps/bot/src/services/scheduler.ts`.
- Rules template: `database/firestore.rules.template`.
- Browser token/preference handling: `src/App.tsx`; `src/lib/api.ts`; `src/lib/LocaleProvider.tsx`.
- Deployment/CI: `docs/DEPLOYMENT.md`; `docs/ARCHITECTURE.md`; `.github/workflows/ci.yml`; `.github/workflows/deploy-pages.yml`.
- Existing claims to reconcile with implementation: `docs/SECURITY.md`; `docs/DATABASE.md`; `AI_WORKFLOW.md`; `ROADMAP.md`.

Provider reference links (recheck the current versions and applicable terms before legal publication):

- Discord Privacy Policy: <https://discord.com/privacy>
- Discord OAuth2 documentation: <https://discord.com/developers/docs/topics/oauth2>
- Firebase privacy and data-protection information: <https://firebase.google.com/support/privacy>
- Google Cloud Privacy Notice: <https://cloud.google.com/terms/cloud-privacy-notice>
- Google Cloud default encryption at rest: <https://cloud.google.com/docs/security/encryption/default-encryption>
- Firestore Security Rules documentation: <https://firebase.google.com/docs/firestore/security/get-started>
- GitHub General Privacy Statement: <https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>
