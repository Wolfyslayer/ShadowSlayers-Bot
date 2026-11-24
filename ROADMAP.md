# ShadowSlayers – Legends of Elements: Master Roadmap

> **Scope Policy**: This platform contains **zero AI functionality**. All moderation, AutoMod, localization, onboarding, and administration features operate deterministically via rule engines, explicit templates, and manual administrator review.

## Progress Summary

| Metric | Status |
| :--- | :--- |
| **Current Phase** | Phase 0.1 – Legacy Bot Compatibility, Server Setup Audit & Foundation Corrections (On Feature Branch) |
| **Verification Model** | Every phase tracks 5 gates: **Implemented**, **Automated Tests Passed**, **Live Discord Test Passed**, **Reviewed & Approved**, **Deployed** |
| **Automated Implementation Progress** | Core architecture + Phase 0.1 compatibility corrections implemented & tested with **mocked Discord API objects**; **Live Discord Server Verification Pending** (`DISCORD_BOT_TOKEN` & live guild test required) |
| **Blocked / External Dependencies** | `Wolfyslayer/shadow-slayers-discord-setup` inaccessible (HTTP 404 from sandbox); live Discord Gateway & external Firestore/GitHub remote pending deployment |
| **Test Status** | Updated in `tests/platform.test.ts` (unit + mocked Discord API integration tests only; NOT live Discord tests) |

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
  - [ ] Live Discord Test Passed (Requires live `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `Wolfyslayer/shadow-slayers-discord-setup` access)
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
- **Goals**: Production-grade, responsive dark fantasy React web dashboard hosted cleanly via GitHub Pages or unified Express runtime.
- **Features**: All 14 dashboard workspaces, mobile/tablet/desktop responsiveness, Discord OAuth2 + secure `scrypt` admin authentication.
- **Required Files**: `src/App.tsx`, `src/components/**/*`, `server.ts`.
- **Dependencies**: Phases 1–14.
- **Implementation Tasks**:
  - [x] Build Obsidian Sanctum dark fantasy design system (`Cinzel`, `Plus Jakarta Sans`, `JetBrains Mono`)
  - [x] Implement Discord OAuth2 popup flow + `scrypt` first-run admin claim fallback
  - [x] Implement all 14 live interactive dashboard modules wired to persistent API
  - [x] Verify responsive layout and production bundle compilation
- **Acceptance Criteria**: Every button/form persists real state to DB; zero private secrets in frontend bundle; responsive sidebar drawer works on mobile.
- **Tests**: `vite build` & `tsc --noEmit` passed.
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
- **Features**: Full `tsc --noEmit`, `npm test`, `npm run build`, security audit of API routes and `.env.example`.
- **Required Files**: `tests/platform.test.ts`.
- **Dependencies**: Phases 0–16.
- **Implementation Tasks**:
  - [x] Execute unit & integration test suite across permissions, localization, AutoMod, XP, and scheduler
  - [x] Run `npm run lint` (`tsc --noEmit`) and `npm run build`
  - [x] Verify live Express API + Dashboard runtime flows
  - [x] Update `ROADMAP.md` completion metrics truthfully
- **Acceptance Criteria**: 100% test pass rate, clean TypeScript build, zero exposed secrets, zero AI dependencies.
- **Tests**: 6/6 tests passing (`npm test`).
- **Risks**: Regression in edge-case validation or responsive tables.
- **Documentation Requirements**: Updated `ROADMAP.md`.

## Phase 18 – Deployment and Launch
- **Goals**: Prepare repeatable deployment configuration for GitHub, GitHub Pages, Lunafy, and Firebase Spark (or Supabase fallback).
- **Features**: GitHub Actions CI + Pages deploy workflow, Lunafy Node.js startup entry, Firestore security rules template, backup/recovery guide.
- **Required Files**: `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`, `database/firestore.rules.template`, `docs/DEPLOYMENT.md`.
- **Dependencies**: Phase 17.
- **Implementation Tasks**:
  - [ ] Push repository to user's GitHub remote
  - [ ] Configure `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_GUILD_ID` on Lunafy
  - [ ] Provision external Firebase Spark project & deploy `database/firestore.rules.template`
  - [ ] Set `VITE_API_BASE_URL` variable in GitHub repo and enable GitHub Pages deployment
- **Acceptance Criteria**: Live Discord Gateway connected on Lunafy and static dashboard served from GitHub Pages.
- **Tests**: Production bundle build verification (`npm run build` passed).
- **Risks**: CORS / API URL misconfiguration between GitHub Pages origin and Lunafy API origin.
- **Documentation Requirements**: `DEPLOYMENT.md`, `DATABASE.md`, `SECURITY.md`.
