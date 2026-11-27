# ShadowSlayers Bot – Roadmap

> **Product direction (2026-11):** ShadowSlayers is being evolved from a server-specific bot into a configurable, multi-guild Discord bot platform. A newly added guild must start with an empty workspace and real Discord state—not a copy of the original ShadowSlayers server. Each guild owns its modules, commands, roles, channels, templates, permissions and data. Existing legacy features may remain available as optional modules/templates, but must not be imposed on new guilds.
>
> **Hosting decision:** Keep the current persistent bot on Lunafy and the trusted API on Google Cloud Run. Keep the existing static dashboard hosting/domain unchanged. Build a portable, modular bot so a later move to Google Cloud does not require a rewrite. No hosting migration or paid capacity increase is part of the current roadmap.
>
> **AI boundary:** “AI workflow” refers only to the engineering workflow for coding assistants. No AI/LLM functionality is to be added to the bot or dashboard.

## Current platform roadmap

Status is based on repository inspection, not assumptions from UI labels. “Existing baseline” means code exists; it does not mean every function has been verified live on Discord.

### Phase 0.4.1 – Build & Deployment Automation
- [x] Audit existing CI, API deployment configuration and Lunafy runtime requirements; enable CI validation on pull requests.
- [x] Add manual workflow_dispatch bot build with security audit, lint/typecheck, tests, build and startup verification.
- [x] Upload a downloadable, version-and-commit-labelled Lunafy artifact containing dist-bot, package.json and package-lock.json; validate a production install and exclude dependencies, secrets and development files.
- [x] Verify artifact structure and document Android download, Lunafy upload, restart and package rollback.
- [x] Add manual Cloud Run API deployment workflow restricted to main, typed confirmation and protected production approval; preserve existing service configuration, secrets, URL and runtime identity and restore previous traffic on failed health verification.
- [x] Configure keyless GitHub OIDC / Workload Identity Federation inputs with repository/branch restrictions and least-privilege owner setup documentation; no credential key is used.
- [ ] Verify CI and artifact build; separately verify approved live deployment and health checks, with rollback instructions.
- [x] Update AI_WORKFLOW.md and deployment documentation with per-phase deployment requirements, Android procedures and Cloud Run revision rollback.
- **Acceptance:** mobile-only build/download/upload to Lunafy and manual API deployment to the existing shadowslayers-api service in europe-west4, project shadowslayers-7f48f. No automatic production deploy, direct Codex cloud credentials, hosting migration or unapproved cost increase.
- **Post-merge verification:** GitHub run 45795227598 published the Lunafy artifact and the owner confirmed it worked on Lunafy. Run 45802348457 deployed revision `shadowslayers-api-00006-z4k` with the dedicated builder. The live health endpoint reported healthy with Firestore.
- **Status:** complete, 8/8 tasks. Merged through PR #5.

### Phase 0.5 – Production data cleanup and empty guild foundation
- The CLI preview found 17 and 8 matching entries in the two approved test guilds. The owner completed the export, waived the restore test for this cleanup only, and reported zero matching entries in the post-cleanup preview.
- **Status:** implementation, automated regression checks and the fresh-guild live acceptance check passed. The owner confirmed cleanup for both scoped test guilds. The Lunafy PR build (`c12b0d6`) initialized a new Discord test guild. The read-only Firestore check reported zero failures for guild identity, empty activity lists, empty template proposals, Discord ID format and absence of scheduled tasks. See [Firestore inventory and cleanup](docs/FIRESTORE_CLEANUP.md).
- [x] Replace production use of `createInitialGuildSeed()` with a minimal, schema-valid empty guild factory.
- [x] Remove all fabricated members, moderation cases, warnings, appeals, logs, tickets, onboarding records, polls, giveaways, events, XP and example language content from production initialization.
- [x] Remove the hardcoded `shadowslayers-primary` fallback from dashboard guild selection; require an authenticated, authorized guild.
- [x] Keep test fixtures isolated under tests and make production imports unable to seed fixture records.
- [x] Preserve schema defaults and safe empty arrays/configuration; do not confuse technical defaults with demo content.
- [x] Audit Firestore records in the two approved test guilds, export a backup and prepare a record-level cleanup plan before deletion.
- **Acceptance:** a newly installed guild has zero fabricated records and only real Discord information; existing production data is not deleted or rewritten.
- **Tests:** empty-guild factory, no production seed imports, no default guild fallback, migration and Firestore regression tests.

### Phase 0.6 – Real Discord guild/member synchronization
- **Status:** implemented and automatically tested. The owner reported deploying the bot. Manual live acceptance is deferred to Phase 1.5. The stale-write protection requires the matching adapter in both the bot and API.
- [x] Enumerate and synchronize actual members on initial guild availability, with pagination and Discord REST rate-limit handling.
- [x] Add a `GuildMemberAdd` path that creates or updates a real member record.
- [x] Keep `GuildMemberUpdate` role/verification synchronization, but do not silently skip members with no database record.
- [x] Preserve departed-member history while excluding departed members from the active dashboard member list and overview count.
- [x] Reconcile missing/changed members after Discord session resume; avoid treating partial snapshots as evidence of departure.
- [x] Use stable Discord user IDs as identity; do not infer membership from demo profiles or role-name-only assumptions.
- **Acceptance:** member counts and lists match Discord, including joins, role changes, departures and reconnect recovery.
- **Tests:** join/update/leave/rejoin, missing-record recovery, pagination, idempotency, departed-member filtering.

### Phase 0.7 – Dashboard/API functional audit and repair
- **Status:** scheduler control removed. Navigation, feature API routes, commands, setup, role panels, queue actions and message handlers honor module flags. Shared role jobs carry a signed source module. Disabled community jobs stay pending; retention and temporary-grant cleanup continue. Dashboard guild snapshots are scoped to the active session and guild. Remaining controls and API contracts are under audit.
- [x] Map dashboard actions to routes, capabilities, persistence and bot effects in [Dashboard API audit](docs/DASHBOARD_API_AUDIT.md).
- [ ] Remove, disable or correctly implement controls that currently have no working operation. Onboarding buttons reflect module state. Ticket creation is a dashboard record. Discord announcement delivery is explicitly unavailable.
- [x] Remove the manual scheduler control from the dashboard. The legacy API route remains an explicit HTTP 503 for older dashboard versions.
- [ ] Apply module toggles consistently to navigation, routes, commands and bot event handlers. Overview shortcuts now use the same module policy as the sidebar.
- [ ] Add clear loading, success, failure and offline states; never show a successful UI state for an unverified Discord operation.
- [ ] Reconcile documentation with actual route behavior.
- **Acceptance:** every visible control has a verified end-to-end behavior or is explicitly marked unavailable.
- **Tests:** automated dashboard guild method/path contract and critical route-declaration checks, command capability and bot-offline regression tests. These are static and local checks; live acceptance belongs to Phase 1.5.

### Phase 0.8 – Generic guild model and modular bot foundation
- [ ] Separate generic guild settings from legacy clan-rank, language-role and ShadowSlayers-specific assumptions.
- [ ] Replace fixed clan-rank authorization with per-guild roles/capabilities and Discord permission checks.
- [ ] Define module manifests: dependencies, required permissions/intents, settings schema, commands, event handlers and migrations.
- [ ] Make modules independently enabled/disabled per guild; disabled modules must not expose commands, navigation or event side effects.
- [ ] Keep one shared Gateway bot process serving many guilds with strict guild-data isolation.
- [ ] Keep the runtime container-ready and configuration-driven for a future Google Cloud migration; do not migrate hosting now.
- **Acceptance:** a clean guild can enable selected modules without receiving legacy roles, channels or permissions.
- **Tests:** cross-guild isolation, module enable/disable, permission boundaries, startup and container build.

### Phase 0.9 – Secure install welcome and dashboard handoff
- [ ] On bot installation, send one welcome/setup message in a safe system channel or an explicitly selected channel.
- [ ] Welcome message explains how to start with `/setup`; avoid unsolicited channel creation.
- [ ] Implement `/setup` as a private response with an “Open dashboard” action.
- [ ] Authenticate the Discord user and verify guild-management permission on the API, not from URL parameters.
- [ ] Use a short-lived, single-use handoff ticket exchanged server-side for a session; never put long-lived bearer secrets in the URL.
- [ ] Open the dashboard with the initiating guild selected; still allow the user to switch only among authorized guilds.
- **Acceptance:** the dashboard opens authenticated to the correct guild and cannot be used to access another guild by changing an ID.
- **Tests:** ticket expiry/replay, wrong user, wrong guild, permission revocation, popup/deep-link behavior.

### Phase 1.0 – Empty-first Server Template Maker
- [ ] Create a visual server structure editor for categories, text channels, voice channels and descriptions.
- [ ] Create/configure roles and permission overwrites with safe previews.
- [ ] Allow channel selection for welcome, logs, moderation, tickets and other enabled modules.
- [ ] Show a complete diff/preview before applying any Discord changes.
- [ ] Apply changes idempotently and report partial failures with retry support.
- [ ] Never delete, rename or overwrite existing Discord resources without a separate explicit confirmation.
- **Acceptance:** users can design a server from an empty canvas and safely apply only the approved changes.

### Phase 1.1 – Per-guild module and built-in command selection
- [ ] Build a clear module catalogue with descriptions, dependencies and required Discord permissions.
- [ ] Let each guild enable/disable built-in modules and commands independently.
- [ ] Hide or disable module navigation and slash commands when the module is off.
- [ ] Explain dependencies and prevent disabling a required dependency without confirmation.
- **Acceptance:** each guild has an independent feature set and no legacy module is enabled by assumption.

### Phase 1.2 – Custom Command Builder
- [ ] Create custom slash commands without editing bot source code.
- [ ] Support safe response types: text, embeds, variables, links and ephemeral/public replies.
- [ ] Configure required permissions, allowed roles and channel restrictions.
- [ ] Add allowlisted actions (send message, grant/revoke a configured role, etc.) with permission checks and audit logs.
- [ ] Validate command names, payload size, mentions, URLs and action arguments.
- [ ] Version commands and provide preview/test before publishing.
- **Acceptance:** custom commands are guild-scoped, validated, auditable and cannot execute arbitrary code.

### Phase 1.3 – Template library and reusable automation
- [ ] Save, duplicate, import and export user-created templates.
- [ ] Offer optional starter templates (Gaming, Community, Clan/Guild, Support); never auto-apply them.
- [ ] Add safe automation builder for supported triggers/actions with execution history and loop protection.
- [ ] Ensure templates contain configuration only, never another guild's live user data or secrets.
- **Acceptance:** templates can be reused across guilds without cross-guild data leakage.

### Phase 1.4 – Security, privacy, reliability and migration readiness
- [ ] Complete cross-guild authorization and data-isolation review.
- [ ] Add rate limits, audit trails, retention controls and safe backup/restore.
- [ ] Verify scheduler recovery, queue retries, idempotency and bot restart behavior.
- [ ] Add health/readiness diagnostics and structured operational logs.
- [ ] Validate container portability without changing current hosting.
- **Acceptance:** documented threat model, tested recovery and no known cross-guild access path.

### Phase 1.5 – Final end-to-end QA and release
- [ ] Run deferred manual acceptance checks from earlier phases in a coordinated deployment. For Phase 0.6, compare Discord member IDs and counts with Firestore and dashboard, test join, rename and role changes, leave/rejoin without losing progress, restart and Gateway resume, and confirm a concurrent API write cannot overwrite a newer bot write.
- [ ] Test with at least two independent test guilds with different module selections.
- [ ] Verify fresh install, setup handoff, template preview/apply, custom commands and member lifecycle.
- [ ] Run all CI checks and live test checklist; distinguish simulated tests from real Discord/Firestore tests.
- [ ] Update deployment and administrator documentation.
- [ ] Follow the standing merge approval in AI_WORKFLOW.md and obtain separate approval for production release.
- **Acceptance:** a new guild can independently build and operate its own server experience.

## Current audit snapshot

- [x] Repository architecture and current deployment split reviewed.
- [x] Production seed path identified.
- [x] Main dashboard views and visible action handlers inventoried.
- [x] API route inventory and authorization middleware reviewed.
- [x] Module flags and current clan-specific permission model reviewed.
- [x] Bot member lifecycle handlers reviewed.
- [x] CI and existing test coverage reviewed.
- [ ] Every API operation traced through queue consumer to Discord side effect.
- [ ] Firestore production data inventory and safe backup plan completed (read-only until approval).
- [ ] Full multi-guild isolation and module dependency review completed.
- [ ] Docs-only roadmap/audit PR reviewed and approved.

## Legacy implementation history

The original phases below document the ShadowSlayers-specific baseline and should be treated as historical implementation records, not as proof that the platform roadmap above is complete. Existing capabilities may be retained as optional modules or starter templates after decoupling.

---

> **Scope Policy**: This platform contains **zero AI functionality**. All moderation, AutoMod, localization, onboarding, and administration features operate deterministically via rule engines, explicit templates, and manual administrator review.

## Progress Summary

| Metric | Status |
| :--- | :--- |
| **Current Phase** | Phase 0.4 – NPM-only Migration & Independent Applications (in progress on `main`) |
| **Verification Model** | Every phase tracks 5 gates: **Implemented**, **Automated Tests Passed**, **Live Discord Test Passed**, **Reviewed & Approved**, **Deployed** |
| **Automated Implementation Progress** | Phase 0.3 foundations remain in place. Phase 0.4 is partial: npm-only scripts and lockfile, standalone bot lifecycle, isolated API/static builds, guild-bound API sessions, and truthful deployment docs are implemented; independent API-to-bot control and live service configuration remain incomplete. |
| **Blocked / External Dependencies** | Dashboard Discord mutations require a trusted API-to-bot control path. Live Discord verification needs user-provided bot credentials; live Firestore verification needs Firebase Admin credentials; Pages deployment needs API origin/configuration. Lunafy package/upload workflow has not been validated. |
| **Test Status** | Current Windows verification: `npm ci`, `npm run lint`, 24 automated tests, `npm run security:check`, `npm audit --audit-level=high`, bot/dashboard/API builds, and standalone startup validation passed. No live Discord, Firebase, Pages, or Lunafy test was performed. |

---

## Phase 0 – Project Foundation
- **Goals**: Establish monorepo-style modular workspace, TypeScript configuration, environment templates, documentation baseline, and CI pipeline.
- **Verification Gates**:
  - [x] Implemented
  - [x] Automated Tests Passed (`tsc --noEmit`, `vite build`, `npm test`)
  - [ ] Live Discord Test Passed (N/A for static workspace scaffold; runtime verified in Phase 0.1+)
  - [ ] Reviewed & Approved
  - [ ] Deployed
- **Implementation Tasks**:
  - [x] Configure TypeScript, Express + Vite unified runtime, and npm scripts
  - [x] Create `.env.example` with placeholders only and hardened `.gitignore`
  - [x] Author `ROADMAP.md`, `AI_WORKFLOW.md`, and `docs/*`
  - [x] Configure GitHub Actions CI & GitHub Pages workflow

## Phase 0.1 – Legacy Compatibility Audit & Foundation Corrections
- **Goals**: Preserve exact ShadowSlayers Discord server compatibility (`16` emoji-prefixed roles, `9` categories, `25` template channels), harden OAuth2 authorization, remove `@google/genai`, enforce DB non-fallback, and implement ephemeral `/setup` workflow.
- **Verification Gates**:
  - [x] Implemented (on branch `phase-0.1/legacy-compatibility-audit`)
  - [x] Automated Tests Passed (unit & mocked Discord API integration tests in `tests/platform.test.ts`)
  - [ ] Live Discord Test Passed (Requires live `DISCORD_BOT_TOKEN`, installation in a test guild, and `Wolfyslayer/shadow-slayers-discord-setup` access)
  - [ ] Reviewed & Approved
  - [ ] Deployed
- **Implementation Tasks**:
  - [x] Document compatibility gaps & corrective actions in `docs/LEGACY_COMPATIBILITY_AUDIT.md`
  - [x] Implement exact 16-role / 9-category template + controlled alias & multi-candidate conflict rejection
  - [x] Implement 9-state resource lifecycle (`discovered` .. `applied` / `failed`), never marking `applied` without verified Discord ID
  - [x] Implement ephemeral initiator-locked `/setup` command (`Missing only`, `Full setup` 2-step confirm, `Cancel`, partial-failure retry)
  - [x] Fix OAuth2 default-deny guild & role authorization + exact `postMessage` & CORS origins
  - [x] Remove `@google/genai` completely and enforce non-fallback on `firestore`/`supabase` DB adapters
  - [x] Wire live Discord execution status (`verified_live` / `dry_run_no_bot` / `failed`) on moderation & `/roles publish`
  - [ ] Execute live test against target ShadowSlayers Discord guild and cross-check private repo `Wolfyslayer/shadow-slayers-discord-setup`

## Phase 0.2 – ShadowSlayers Legacy Reconstruction & Correction
- **Goals**: Reconstruct exact canonical server structure (**16 roles**, **9 categories**, **32 text channels**, **5 voice channels**) strictly from the Phase 0.2 specification without inventing unknown properties, implement 5-step onboarding, expand cross-category setup & permission audits, add missing legacy command parity, and upgrade schema to v3.
- **Verification Gates**:
  - [x] Implemented (directly on `main`)
  - [x] Automated Tests Passed (`tests/legacy-fixture.ts` + `tests/platform.test.ts` with mocked Discord Guilds)
  - [ ] Live Discord Test Passed (Requires live `DISCORD_BOT_TOKEN` against a real test server where the bot is installed)
  - [ ] Reviewed & Approved
  - [ ] Deployed
- **Implementation Tasks**:
  - [x] Reconstruct exact 16 roles (`colorHex: null`, `hoist: null`, `excludeFromAutoSetup: true` on `👑 Shadow King`), 9 categories, 32 text channels, 5 voice channels; isolate optional extension channels (`📜・audit-logs`, `💡・suggestions`)
  - [x] Implement 5-step onboarding (`📜・rules` `✅` reaction add/remove, deliberate removal policy, dynamic role status derivation, gated Step 5 active-player `🌱 Recruit` action)
  - [x] Expand Setup Manager for cross-category `incorrectPlacements`, `incorrectTypes`, `permissionDifferences`, conflict blocking, partial retry, and idempotency
  - [x] Implement `/rules publish`, `/permissions preview`, `/bot-status`, `/automod status`, `/automod test`, `/onboarding`, `/serverinfo`, `/userinfo`, `/avatar`, `/custom-response`, `/false-positive`, and destructive moderation confirmation guards
  - [x] Author `LEGACY_COMPATIBILITY_AUDIT.md`, `LEGACY_SERVER_SPECIFICATION.md`, `FEATURE_PARITY.md`, `SETUP_MANAGER.md`, and `ROLE_AND_PERMISSION_MODEL.md`
  - [ ] Execute live end-to-end verification against target ShadowSlayers Discord server

## Phase 0.3 – ShadowSlayers Technical Corrections & Verification
- **Goals**: Address technical issues identified across CI/package management, Discord slash command option schemas, database architecture with production Firestore, elimination of offline false-success pathways, security & authorization hardening, and comprehensive documentation.
- **Verification Gates**:
  - [x] Implemented (directly on `main`)
  - [x] Automated Tests Passed (21/21 automated unit & integration test suites passed in `tests/platform.test.ts` and `tests/firestore-adapter.test.ts`)
  - [ ] Live Discord Test Passed (Requires live `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID` in a live Discord guild; offline simulated guards verified)
  - [ ] Live Cloud Firestore Verified (Requires live `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` on Firebase Spark)
  - [ ] GitHub Remote Push Executed (Requires user GitHub remote repository configured; sandbox currently has no remote)
- **Phase 0.3 Checklist (7/10 completed — 70.0%)**:
  - [x] **Problem A (npm & CI)**: Generated and committed valid `package-lock.json` matching `package.json`, verified `npm ci` installs cleanly, eliminated peer dependency conflicts with `esbuild`, created automated `scripts/security-check.cjs`, ensured 0 AI packages exist, and enhanced `.github/workflows/ci.yml` (npm ci, security:check, audit, lint, test, build).
  - [x] **Problem B (Real Discord Slash Command Options)**: Centralized complete Discord slash command schemas with real Discord.js options (`StringOption`, `IntegerOption`, `UserOption`, `ChannelOption`, `BooleanOption`), min/max constraints, choices, required-before-optional ordering, subcommands (`onboarding status`/`onboarding active_player`, `permissions matrix`/`permissions preview`, `roles list`/`roles publish`, `automod status`/`automod test`), recursive interaction option extraction (`extractDiscordInteractionArgs`), argument validation before side effects, and SHA-256 hash-cached command registration.
  - [x] **Problem C (Firestore & Database Architecture)**: Implemented server-side `FirestoreDatabaseAdapter` via Firebase Admin SDK (`firebase-admin`) supporting guild isolation under `guilds/{guildId}` with subcollections `logs` and `scheduledTasks`, atomic transactions, per-guild async locks, transient error retries with backoff, fatal error surfacing, and v1->v3 schema migration. Explicitly throws on missing Firestore credentials and unimplemented `supabase`; warns if running `local` JSON in production.
  - [x] **Problem D (Elimination of False Success Paths)**: Require active Discord Gateway connection and confirmed Discord API response before persisting `rulesPublishedAt`, `panel.published`, language channel creation (`channelsCreated`), onboarding role grants (`✅ Verified`, `🌱 Recruit`), `/language` role updates, and moderation actions (`warn`, `timeout`, `kick`, `ban`, `tempban`, `purge`, `slowmode`, `lock`, `unlock`, `unban`). Returns HTTP 503/502 with preserved prior DB state and audit logging of failed attempts.
  - [x] **Problem E (Security & Role Handling Audit)**: Stopped defaulting unranked or unknown members to `'🌱 Recruit'` (assigned `null` with 0 permissions); sanitized HTML in `/auth/callback` 403 error bodies (`escapeHtml`) to prevent reflected XSS; dynamically re-verifies `discord_oauth` sessions against live/persisted Discord roles (`revalidateDiscordOAuthSession`); validated `:guildId` route parameters with `safeIdSchema`. Authored `walkthrough.md` with PoC verifications.
  - [x] **Problem F (Documentation & Roadmap)**: Updated `ROADMAP.md`, `AI_WORKFLOW.md`, and all 10 `docs/*.md` files truthfully, clearly distinguishing automated mocked tests from live Discord Gateway / live Cloud Firestore tests.
  - [x] **Automated Test Suite**: Verified 21/21 test suites passing locally via `npm test`, `npm run lint` (`tsc --noEmit`), `npm run security:check`, and `npm audit --audit-level=high`.
  - [ ] **Live Discord Gateway Verification**: Blocked in current environment without user-provided Discord Bot credentials.
  - [ ] **Live Cloud Firestore Verification**: Blocked in current environment without user-provided Firebase Admin service account keys.
  - [ ] **GitHub Remote Push**: Not performed as part of this phase.

## Phase 0.4 – NPM-only Migration & Independent Applications
- **Goals**: Use npm on Windows/Linux, run the bot without Express/Vite, build the static dashboard independently, and place the trusted API outside Lunafy without weakening auth or Firestore boundaries.
- **Status**: In progress; **do not mark complete** until the dashboard's Discord-dependent operations have a verified separate bot-control backend.
- **Implemented in this change**:
  - [x] Remove the direct Linux-only TypeScript package that blocked Windows `npm ci`; retain Node.js 22 in CI.
  - [x] Remove the obsolete non-npm lockfile; add cross-platform npm scripts and Node-based cleaning.
  - [x] Add an executable bot bootstrap with config validation, Firestore selection, persistent scheduler ownership, slash-command registration, graceful shutdown, and startup error propagation.
  - [x] Split bot, dashboard, and trusted API entry/build outputs; keep API and dashboard off Lunafy.
  - [x] Bind API guild routes to the authenticated session guild and disable unauthenticated first-run admin claiming in production.
  - [x] Audit dashboard API routes and document why direct browser Firestore access is not currently authorized.
  - [x] Keep GitHub Pages build independent of Discord credentials and set its repository base path.
- **Automated verification**: `npm ci` and `npm ci --omit=dev` succeeded on the current Windows environment; production-only dependencies omitted Express, Vite, and tsx. `npm run lint`, 24 tests, security check (including built frontend credential scan), high-severity audit, `build:bot`, `build:dashboard` with `/ShadowSlayers-Bot/` base, `build:api`, and standalone missing-config startup check passed.
- **Remaining blockers / gates**:
  - [ ] Implement and verify a secure API-to-bot control path for discovery, publishing, role grants, moderation, and other live Discord operations.
  - [ ] Configure Firebase Auth and redesign Firestore schema/rules before considering any direct Firebase client SDK operation.
  - [ ] Verify Lunafy artifact installation/start behavior and live bot + Firestore operation with user-controlled credentials.
  - [ ] Configure a trusted API origin and verify Pages OAuth/API operation without exposing private variables.

## Phase 1 – Discord Core
- **Goals**: Build a single, centralized Discord Gateway client in Node.js for Lunafy hosting with automatic recovery and slash-command registration.
- **Verification Gates**:
  - [x] Implemented
  - [x] Automated Tests Passed (command registry & interaction routing tested with mocks)
  - [ ] Live Discord Test Passed (Requires live Discord Gateway token)
  - [ ] Reviewed & Approved
  - [ ] Deployed
- **Implementation Tasks**:
  - [x] Implement single Discord Gateway `Client` with intents and error recovery
  - [x] Build modular slash-command registry & interaction dispatcher
  - [x] Implement general utility and diagnostic commands
  - [x] Add live command simulation endpoint clearly marked `dry_run_no_bot` when bot is offline

## Phase 2 – Server Discovery
- **Goals**: Non-destructive discovery and mapping of existing Discord server structure before any write operations.
- **Features**: Discovery of all 9 existing categories (`📜 01 — GATE OF SHADOWS` through `🏰 09 — CLAN VOICE`), all 16 legacy roles (`👑 Shadow King` through `✅ Verified`), permission overwrites, role positions, uncategorized channels, conflict detection, diff preview, and explicit confirmation gate.
- **Verification Gates**:
  - [x] Implemented
  - [x] Automated Tests Passed (mocked Discord Guild discovery, alias, conflict, and additive setup tests)
  - [ ] Live Discord Test Passed
  - [ ] Reviewed & Approved
  - [ ] Deployed
- **Implementation Tasks**:
  - [x] Implement non-destructive category, channel, uncategorized channel, overwrite, and role scanner
  - [x] Map existing Discord IDs via exact match or single controlled alias (block ambiguous fuzzy matches)
  - [x] Generate proposed setup diff preview without mutating existing roles/permissions
  - [x] Enforce explicit confirmation gate and verified-ID tracking before marking `applied`

## Phase 3 – Multilingual Foundation
- **Goals**: Establish deterministic, non-AI translation resource architecture supporting English (default) and Russian.
- **Features**: Structured translation key schemas, versioning, completeness calculation, `/language` command.
- **Required Files**: `packages/localization/src/engine.ts`.
- **Dependencies**: Phase 0.
- **Implementation Tasks**:
  - [x] Define base translation key catalog (welcome, rules, onboarding, moderation, tickets, clan)
  - [x] Populate complete English (`en`) and Russian (`ru`) translation packs
  - [x] Implement missing-key detector and completeness percentage calculator
  - [x] Track translation version numbers and reviewer attribution
- **Acceptance Criteria**: `en` and `ru` bundles achieve 100% key coverage; zero AI translation dependencies.
- **Tests**: Localization completeness & missing-key unit tests passed.
- **Risks**: Key drift between bot responses and translation dictionaries.
- **Documentation Requirements**: `MODULES.md` (Localization).

## Phase 4 – Dynamic Language Management
- **Goals**: Enable admins to add unlimited languages (e.g., Swedish `sv`), edit translations manually, review/approve, preview channels, and safely create/toggle language realms.
- **Features**: Dynamic language creation, template cloning, manual translation editor, review approval gate, Discord category/channel preview (`🇸🇪 Swedish` -> `🇸🇪・sv-welcome`, etc.), non-destructive disable.
- **Required Files**: `packages/localization/src/engine.ts`, `src/components/views/LanguagesView.tsx`.
- **Dependencies**: Phase 2, Phase 3.
- **Implementation Tasks**:
  - [x] Implement `createLanguageDraft()` generating missing keys from templates
  - [x] Implement manual key editing, review sign-off, and version bumping
  - [x] Build channel structure previewer (`{flag} {name}`, `{flag}・{code}-{slug}`)
  - [x] Enforce approval & explicit confirmation before creating channels; preserve channels/data when disabling
- **Acceptance Criteria**: Adding Swedish creates draft keys, surfaces missing count, requires review before publication, and generates previewed channels without touching clan ranks.
- **Tests**: Dynamic language lifecycle tests passed.
- **Risks**: Partial channel creation on Discord API permissions failure.
- **Documentation Requirements**: `MODULES.md`, `COMMANDS.md`.

## Phase 5 – Onboarding and Roles
- **Goals**: Gate new members to onboarding/rules until explicit acceptance & verification, and separate clan ranks from independent language roles.
- **Features**: Localized welcome & rules, explicit rules acceptance gate, `✅ Verified` role assignment, multi-language selection, gaming class selection, welcome logs, private leadership channel isolation.
- **Required Files**: `packages/permissions/src/hierarchy.ts`, `src/components/views/RolesView.tsx`.
- **Dependencies**: Phase 2, Phase 4.
- **Implementation Tasks**:
  - [x] Configure onboarding messages, rules gate, and `✅ Verified` verification step
  - [x] Separate clan rank hierarchy from multi-select language roles
  - [x] Protect `Inner Sanctum` and leadership channels from unverified/ordinary members
  - [x] Log onboarding completions and verification timestamps
- **Acceptance Criteria**: Unverified members cannot access clan/sanctum channels; members can hold 1 clan rank + N language roles simultaneously.
- **Tests**: Role independence & hierarchy validation tests passed.
- **Risks**: Misconfigured channel permission overwrites exposing leadership channels.
- **Documentation Requirements**: `SECURITY.md`, `MODULES.md`.

## Phase 6 – Carl-bot Replacement
- **Goals**: Replace external reaction/role/utility bots with unified, dashboard-configurable role panels and safe publishing.
- **Features**: Reaction roles, button roles, select-menu roles, self-assignable roles, auto-roles, temporary roles, exclusive groups, multi-select groups, notification roles, `/roles publish`.
- **Required Files**: `apps/bot/src/commands/registry.ts`, `src/components/views/RolesView.tsx`.
- **Dependencies**: Phase 5.
- **Implementation Tasks**:
  - [x] Implement Role Panel builder (button, select menu, reaction modes)
  - [x] Support exclusive role groups (e.g., Clan Rank / Class) vs multi-select groups (Languages / Notifications)
  - [x] Implement `/roles publish` strictly publishing panels (never running full server setup)
  - [x] Log every role grant/removal with actor attribution and permission validation
- **Acceptance Criteria**: `/roles publish` only publishes targeted panels; hierarchy checks block privilege escalation.
- **Tests**: `/roles publish` execution test passed.
- **Risks**: Role hierarchy mismatch if bot's highest role sits below target role.
- **Documentation Requirements**: `COMMANDS.md`.

## Phase 7 – Moderation
- **Goals**: Provide full case-tracked moderation with appeals, durations, and automatic expiration.
- **Features**: `/warn`, `/warnings`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/tempban`, `/unban`, `/purge`, `/slowmode`, `/lock`, `/unlock`, `/modlog`, `/case`, `/appeal`.
- **Required Files**: `apps/bot/src/commands/registry.ts`, `src/components/views/ModerationView.tsx`.
- **Dependencies**: Phase 1, Phase 5.
- **Implementation Tasks**:
  - [x] Implement unique case ID generator and immutable case ledger
  - [x] Enforce moderator role hierarchy checks against target members
  - [x] Implement appeal submission and moderator review workflow
  - [x] Persist temporary ban/timeout expiration tasks in scheduler
- **Acceptance Criteria**: Every action generates a timestamped case ID, checks hierarchy, logs to modlog, and schedules expiry where temporary.
- **Tests**: Moderation hierarchy & command verification passed.
- **Risks**: Unhandled Discord API errors when target member left server.
- **Documentation Requirements**: `COMMANDS.md`, `SECURITY.md`.

## Phase 8 – AutoMod and Security
- **Goals**: Deterministic rule-based AutoMod protecting server channels without AI or reckless permanent auto-bans.
- **Features**: Spam burst detection, repeated message detection, mass mentions, link/phishing domain blocklists, invite restrictions, blocked words, raid join-spike detection, new-account age threshold, auto-slowmode, emergency lockdown, role/channel exemptions.
- **Required Files**: `apps/bot/src/services/automod.ts`, `src/components/views/AutoModView.tsx`.
- **Dependencies**: Phase 7.
- **Implementation Tasks**:
  - [x] Implement sliding-window spam, duplicate message, and mention counters
  - [x] Implement phishing domain, invite link, and blocked word matchers
  - [x] Implement raid join-rate detector and emergency channel lockdown toggle
  - [x] Enforce trusted role/channel exemptions and non-permanent escalation actions
- **Acceptance Criteria**: Zero AI dependencies; no permanent bans from automated rules alone; every trigger logged.
- **Tests**: AutoMod invite/mention/exemption unit tests passed.
- **Risks**: False positives on legitimate community links without allowlist tuning.
- **Documentation Requirements**: `SECURITY.md`, `MODULES.md`.

## Phase 9 – Centralized Logging
- **Goals**: Unified, searchable audit trail across Discord events, moderation, tickets, recruitment, and dashboard mutations.
- **Features**: Configurable per-category log channels, searchable dashboard log viewer, category/user/date filters, retention policy enforcement, RBAC-protected log access.
- **Required Files**: `packages/database/src/adapter.ts`, `src/components/views/LoggingView.tsx`.
- **Dependencies**: Phase 7, Phase 8.
- **Implementation Tasks**:
  - [x] Define structured `AuditLogEntry` schema across 17+ event categories
  - [x] Wire all bot commands, AutoMod actions, and dashboard API writes to centralized logger
  - [x] Build searchable, filterable dashboard log viewer with retention cleanup
  - [x] Enforce privacy boundaries (never access unavailable message content)
- **Acceptance Criteria**: Every admin dashboard mutation and bot action creates a structured log entry queryable by category, user, and date range.
- **Tests**: Verified in server API & adapter.
- **Risks**: Rapid log growth under raid conditions without retention pruning.
- **Documentation Requirements**: `DATABASE.md`, `SECURITY.md`.

## Phase 10 – Member Progression
- **Goals**: Build anti-farming XP, leveling, achievements, and leaderboards integrated with clan ranks and classes.
- **Features**: Member profiles, XP/level curve, achievements, leaderboards, activity stats, configurable XP rules, anti-farming cooldowns & duplicate message filters.
- **Required Files**: `apps/bot/src/services/xp.ts`, `src/components/views/MembersView.tsx`.
- **Dependencies**: Phase 5, Phase 9.
- **Implementation Tasks**:
  - [x] Implement cooldown-enforced XP award engine with duplicate-hash & short-message blocking
  - [x] Implement achievement unlock conditions and leaderboard sorting
  - [x] Build member profile & progression inspection UI in dashboard
  - [x] Implement `/profile`, `/leaderboard`, `/achievements`, `/activity`
- **Acceptance Criteria**: Repeated identical messages or rapid bursts grant 0 XP; level-up calculations match configured formula.
- **Tests**: XP anti-farming cooldown & duplicate suppression unit tests passed.
- **Risks**: Abusive farming in low-moderation channels without per-channel multipliers.
- **Documentation Requirements**: `MODULES.md`.

## Phase 11 – Recruitment
- **Goals**: Configurable multi-category recruitment forms and structured staff review workflow.
- **Features**: Form builder (clan, staff, event recruitment), `/apply`, `/recruitment`, `/applications`, reviewer attribution, approve/reject with notes, recruitment logs.
- **Required Files**: `src/components/views/RecruitmentView.tsx`, `apps/bot/src/commands/registry.ts`.
- **Dependencies**: Phase 5, Phase 9.
- **Implementation Tasks**:
  - [x] Implement configurable form schemas per recruitment category
  - [x] Build submission endpoint and `/apply` command handler
  - [x] Implement review queue with approve/reject transitions and reviewer attribution
  - [x] Log recruitment decisions to centralized audit log
- **Acceptance Criteria**: Applications record reviewer UID/name on every decision.
- **Tests**: Verified via command registry and API endpoints.
- **Risks**: Incomplete form validation allowing malformed answers.
- **Documentation Requirements**: `COMMANDS.md`, `MODULES.md`.

## Phase 12 – Tickets
- **Goals**: Private, numbered support ticket system with secure transcripts and staff controls.
- **Features**: Ticket categories & panels, automatic sequential numbering, claim/transfer/close/reopen, transcript archiving, post-close feedback, authorized-only access.
- **Required Files**: `src/components/views/TicketsView.tsx`, `apps/bot/src/commands/registry.ts`.
- **Dependencies**: Phase 5, Phase 9.
- **Implementation Tasks**:
  - [x] Implement sequential ticket numbering and category routing
  - [x] Implement claim, transfer, close, reopen, and feedback endpoints
  - [x] Store message transcripts securely with role-checked viewing
  - [x] Implement `/ticket` subcommands
- **Acceptance Criteria**: Closed transcripts remain readable only by authorized staff roles.
- **Tests**: Verified via command registry & TypeScript checks.
- **Risks**: Numbering collisions without atomic sequence increment.
- **Documentation Requirements**: `DATABASE.md`, `SECURITY.md`.

## Phase 13 – Community Features
- **Goals**: Unified community engagement suite replacing standalone polling, giveaway, suggestion, reminder, and event bots.
- **Features**: Suggestions + voting, polls, giveaways (with scheduler auto-draw), events + attendance, reminders, birthdays, community challenges, inactivity reports, scheduled announcements.
- **Required Files**: `src/components/views/CommunityView.tsx`, `apps/bot/src/services/scheduler.ts`.
- **Dependencies**: Phase 9, Phase 10.
- **Implementation Tasks**:
  - [x] Implement suggestions with up/down voting and staff status updates
  - [x] Implement multi-option polls, giveaways, and event RSVP attendance
  - [x] Implement reminders, birthdays, challenges, and scheduled announcements
  - [x] Expose `/suggest`, `/poll`, `/giveaway`, `/event`, `/remind`
- **Acceptance Criteria**: Giveaways, reminders, and scheduled announcements persist to database and execute via scheduler.
- **Tests**: Verified via scheduler & command tests.
- **Risks**: Duplicate giveaway draws on bot restart without idempotent lock.
- **Documentation Requirements**: `COMMANDS.md`, `MODULES.md`.

## Phase 14 – Gaming and Clan Management
- **Goals**: Game-agnostic clan operations supporting ShadowSlayers hierarchy, classes, squads, raids, dungeons, and attendance.
- **Features**: Member directory, clan hierarchy, configurable gaming classes & game profiles, team formation, raid/dungeon scheduling, attendance tracking, class distribution stats, inactivity reports.
- **Required Files**: `src/components/views/ClanView.tsx`, `apps/bot/src/commands/registry.ts`.
- **Dependencies**: Phase 10, Phase 11, Phase 13.
- **Implementation Tasks**:
  - [x] Model game-agnostic `GameProfile` and `GamingClass` definitions
  - [x] Build team/squad roster manager and raid/dungeon event scheduler
  - [x] Implement attendance tracking and class distribution metrics
  - [x] Implement `/clan`, `/members`, `/activity`
- **Acceptance Criteria**: Admins can add new games/classes without code changes; raid attendance updates member stats.
- **Tests**: Verified via TypeScript & command registry tests.
- **Risks**: Coupling progression fields to a single game title.
- **Documentation Requirements**: `MODULES.md`, `DATABASE.md`.

## Phase 15 – Administration Dashboard
- **Goals**: Static dark fantasy React dashboard on GitHub Pages, connected only to a separately hosted trusted API.
- **Features**: 14 dashboard workspaces, responsive UI, server-side Discord OAuth2 + secure `scrypt` admin authentication. Static hosting alone does not provide API functionality.
- **Required Files**: `src/App.tsx`, `src/components/**/*`, `server.ts`.
- **Dependencies**: Phases 1–14.
- **Implementation Tasks**:
  - [x] Build Obsidian Sanctum dark fantasy design system (`Cinzel`, `Plus Jakarta Sans`, `JetBrains Mono`)
  - [x] Implement Discord OAuth2 popup flow + `scrypt` first-run admin claim fallback
  - [x] Implement all 14 dashboard modules wired to authenticated API routes
  - [ ] Verify feature-complete operation with a separately hosted API and secure API-to-bot control path
  - [x] Verify responsive layout and production bundle compilation
- **Acceptance Criteria**: API-backed forms use a real authenticated service, no private secrets are in the frontend bundle, and Discord-dependent actions are connected to the bot.
- **Tests**: Static build/typecheck require CI re-verification; live service integration is not verified.
- **Risks**: Cross-origin iframe cookie blocking during preview OAuth (mitigated via Bearer session in memory).
- **Documentation Requirements**: `ARCHITECTURE.md`, `SECURITY.md`.

## Phase 16 – Automation and Integrations
- **Goals**: Crash-safe, persistent scheduled task runner handling expirations, reminders, announcements, and maintenance.
- **Features**: Persistent task queue in DB, idempotent lock/execution guard preventing duplicate runs across restarts.
- **Required Files**: `apps/bot/src/services/scheduler.ts`, `database/schema-migrations.ts`.
- **Dependencies**: Phases 7, 13, 14.
- **Implementation Tasks**:
  - [x] Build persistent `ScheduledTask` runner with atomic claim-and-complete semantics
  - [x] Wire task handlers for tempbans, temp roles, giveaways, reminders, announcements, cleanup
  - [x] Expose task queue inspection and manual trigger in dashboard
- **Acceptance Criteria**: Restarting the server/bot never re-executes already completed tasks; overdue tasks recover cleanly on boot.
- **Tests**: Scheduler idempotency unit test passed.
- **Risks**: Clock skew or overlapping poll intervals causing double dispatch.
- **Documentation Requirements**: `ARCHITECTURE.md`, `DATABASE.md`.

## Phase 17 – Final Quality Assurance
- **Goals**: Verify TypeScript safety, automated tests, security invariants, responsiveness, and documentation accuracy.
- **Features**: Full `tsc --noEmit`, `npm test`, independent app builds, and security audit of API routes and `.env.example`.
- **Required Files**: `tests/platform.test.ts`.
- **Dependencies**: Phases 0–16.
- **Implementation Tasks**:
  - [x] Execute unit & integration test suite across permissions, localization, AutoMod, XP, and scheduler
  - [x] Run `npm run lint` (`tsc --noEmit`) and application builds
  - [ ] Verify deployed trusted API + GitHub Pages + bot control-plane flows (not yet implemented)
  - [x] Update `ROADMAP.md` completion metrics truthfully
- **Acceptance Criteria**: 100% test pass rate, clean TypeScript build, zero exposed secrets, zero AI dependencies.
- **Tests**: 6/6 tests passing (`npm test`).
- **Risks**: Regression in edge-case validation or responsive tables.
- **Documentation Requirements**: Updated `ROADMAP.md`.

## Phase 18 – Deployment and Launch
- **Goals**: Prepare repeatable deployment configuration for GitHub, GitHub Pages, Lunafy, a separate trusted API, and Firebase.
- **Features**: GitHub Actions CI + Pages deploy workflow, Lunafy Node.js startup entry, Firestore security rules template, backup/recovery guide.
- **Required Files**: `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`, `database/firestore.rules.template`, `docs/DEPLOYMENT.md`.
- **Dependencies**: Phase 17.
- **Implementation Tasks**:
  - [ ] Push repository to user's GitHub remote
  - [ ] Configure `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, Firestore Admin variables, and `BOT_CONTROL_SECRET` on Lunafy
  - [ ] Deploy the trusted API separately with a stable `SESSION_SECRET` and no Discord Gateway
  - [ ] Provision external Firebase Spark project & deploy `database/firestore.rules.template`
  - [ ] Set `VITE_API_BASE_URL` variable in GitHub repo and enable GitHub Pages deployment
- **Acceptance Criteria**: Bot-only Lunafy process, secure external API-to-bot operations, and authenticated GitHub Pages dashboard.
- **Tests**: Build and CI verification pending for this phase; no live Discord/Firestore claims.
- **Risks**: API-to-bot control path and CORS/API URL configuration remain unresolved.
- **Documentation Requirements**: `DEPLOYMENT.md`, `DATABASE.md`, `SECURITY.md`.
