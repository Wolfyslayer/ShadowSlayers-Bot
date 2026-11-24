# Phase 0.1 – Legacy Compatibility & Foundation Audit

**Target Repository:** `Wolfyslayer/ShadowSlayers-Bot`  
**Audit Branch:** `phase-0.1/legacy-compatibility-audit` (branched cleanly from `main`)  
**Legacy Reference Repository:** `Wolfyslayer/shadow-slayers-discord-setup`

> **Access Note on External Legacy Repository:** Direct HTTP/API access to `https://api.github.com/repos/Wolfyslayer/shadow-slayers-discord-setup` returned **HTTP 404** (private or inaccessible repository from this environment). No private files could be fetched externally. Consequently, this audit compares the pre-audit `main` branch against the authoritative **Phase 0.1 legacy specification** (all 16 exact emoji-prefixed roles, 9 exact emoji-prefixed categories, role-selection groups, onboarding/permission rules, and ephemeral `/setup` workflow). Exact channel topics or optional legacy channels inside `Wolfyslayer/shadow-slayers-discord-setup` beyond those specified remain flagged for **live-repo / live-guild verification** once deployed with Discord & GitHub access.

---

## 1. Existing Legacy Roles (16 Exact Roles)

Every role name below **must** be recognized including its exact emoji prefix and spacing. Discovery checks exact match first, then controlled aliases, preserves Discord Role ID / permissions / color / position, and **blocks automatic selection** (`conflicting`) if multiple alias/fuzzy candidates exist.

| Group | Exact Legacy Role Name | Controlled Aliases | Self-Assignable | Group Behavior | Purpose |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Clan Hierarchy** | `👑 Shadow King` | `Shadow King` | No | Exclusive (Leadership-assigned) | Sovereign owner; full dashboard & server governance |
| **Clan Hierarchy** | `🛡️ Shadow Council` | `Shadow Council` | No | Exclusive (Leadership-assigned) | Senior council; moderation, appeals, setup, multilingual approval |
| **Clan Hierarchy** | `⚔️ Warlord` | `Warlord` | No | Exclusive (Leadership-assigned) | Combat/raid leadership; moderation & raid/clan operations |
| **Clan Hierarchy** | `🔥 Elite Warrior` | `Elite Warrior` | No | Exclusive (Leadership-assigned) | Veteran member; read-only moderation/logging view & ticket support |
| **Clan Hierarchy** | `🖤 ShadowSlayer` | `ShadowSlayer` | No | Exclusive (Leadership-assigned) | Core verified clan member |
| **Clan Hierarchy** | `🌱 Recruit` | `Recruit` | No | Exclusive (Leadership-assigned) | Trial initiate / newly admitted member |
| **Class Roles** | `⚔️ Warrior` | `Warrior` | Yes | **Exclusive** (`class_exclusive`) | Unlocks `⚔️・warrior-hall` |
| **Class Roles** | `🔮 Sorcerer` | `Sorcerer` | Yes | **Exclusive** (`class_exclusive`) | Unlocks `🔮・sorcerer-hall` |
| **Class Roles** | `🗡️ Swordsman` | `Swordsman` | Yes | **Exclusive** (`class_exclusive`) | Unlocks `🗡️・swordsman-hall` |
| **Notifications** | `📢 Event Pings` | `Event Pings` | Yes | **Multiple** | Event & tournament announcements |
| **Notifications** | `🐉 Boss Pings` | `Boss Pings` | Yes | **Multiple** | Boss spawn & raid alerts |
| **Notifications** | `🏆 PvP Pings` | `PvP Pings` | Yes | **Multiple** | PvP & arena alerts |
| **Language Roles** | `🇬🇧 English` | `English`, `EN` | Yes | **Exclusive** (`language_exclusive`) | English community realm access (zero moderation authority) |
| **Language Roles** | `🇷🇺 Русский` | `Русский`, `Russian`, `RU` | Yes | **Exclusive** (`language_exclusive`) | Russian community realm access (zero moderation authority) |
| **System** | `🤖 Bots` | `Bots` | No | System | Bot integration role |
| **Verification** | `✅ Verified` | `Verified` | No | Onboarding Gate | Granted only after rules acceptance; unlocks server beyond Gate of Shadows |

---

## 2. Existing Legacy Categories (9 Exact Categories)

| # | Exact Legacy Category Name | Controlled Aliases | Access Boundary |
| :-: | :--- | :--- | :--- |
| 1 | `📜 01 — GATE OF SHADOWS` | `Gate of Shadows`, `01 — GATE OF SHADOWS` | Public onboarding (`@everyone` ViewChannel permitted for arrival/rules/verify) |
| 2 | `🔥 02 — THE COMMON HALL` | `Common Hall`, `THE COMMON HALL`, `02 — THE COMMON HALL` | Verified members (`✅ Verified`); denied for unverified `@everyone` |
| 3 | `🌍 03 — LANGUAGE REALMS` | `Language Realms`, `03 — LANGUAGE REALMS` | Verified members (`✅ Verified`) + language channels |
| 4 | `⚔️ 04 — LEGENDS OF ELEMENTS` | `Legends of Elements`, `04 — LEGENDS OF ELEMENTS` | Verified members (`✅ Verified`) |
| 5 | `🧙 05 — CLASS HALLS` | `Class Halls`, `05 — CLASS HALLS` | Per-class isolation (`⚔️ Warrior`, `🔮 Sorcerer`, `🗡️ Swordsman` + leadership audit) |
| 6 | `🖤 06 — SHADOWSLAYERS` | `ShadowSlayers`, `06 — SHADOWSLAYERS` | Verified clan members (`🌱 Recruit` .. `👑 Shadow King`) |
| 7 | `👑 07 — THE INNER SANCTUM` | `Inner Sanctum`, `THE INNER SANCTUM`, `07 — THE INNER SANCTUM` | Leadership only (`👑 Shadow King`, `🛡️ Shadow Council`, `⚔️ Warlord`) |
| 8 | `🔊 08 — VOICE CHAMBERS` | `Voice Chambers`, `08 — VOICE CHAMBERS` | Verified community voice channels |
| 9 | `🏰 09 — CLAN VOICE` | `Clan Voice`, `09 — CLAN VOICE` | Clan-only voice channels |

---

## 3. Machine-Readable Channel Template (25 Structured Channels)

Defined in `packages/shared/src/legacy-template.ts` (`LEGACY_SERVER_TEMPLATE`):

- `📜 01 — GATE OF SHADOWS`: `#welcome` (`text`, required), `#rules` (`text`, required), `#verification` (`text`, required)
- `🔥 02 — THE COMMON HALL`: `#announcements` (`announcement`, required), `#common-hall` (`text`, required), `#role-selection` (`text`, required), `#suggestions` (`text`, optional)
- `🌍 03 — LANGUAGE REALMS`: `#🇬🇧・en-general` (`text`, required), `#🇷🇺・ru-general` (`text`, required)
- `⚔️ 04 — LEGENDS OF ELEMENTS`: `#loe-updates` (`announcement`, required), `#elemental-guides` (`forum`, required), `#dungeon-lfg` (`text`, required)
- `🧙 05 — CLASS HALLS`: `#⚔️・warrior-hall` (`text`, required, `class_hall`), `#🔮・sorcerer-hall` (`text`, required, `class_hall`), `#🗡️・swordsman-hall` (`text`, required, `class_hall`)
- `🖤 06 — SHADOWSLAYERS`: `#clan-hall` (`text`, required), `#clan-roster` (`text`, required), `#recruitment-desk` (`text`, required)
- `👑 07 — THE INNER SANCTUM`: `#council-chamber` (`text`, required, `leadership_only`), `#sanctum-mod-logs` (`text`, required, `leadership_only`), `#sanctum-audit-logs` (`text`, required, `leadership_only`)
- `🔊 08 — VOICE CHAMBERS`: `Citadel Hall VC` (`voice`, required), `Dungeon Party VC` (`voice`, optional)
- `🏰 09 — CLAN VOICE`: `Clan Raid Command` (`voice`, required), `Clan PvP Squad` (`voice`, optional)

---

## 4. Permission Expectations & Onboarding Rules

1. **Discord Permission OR-Combination Model**: In Discord, role `Allow ViewChannel` overwrites combine via logical **OR** across a member's roles. Therefore:
   - `@everyone` **must** explicitly deny `ViewChannel` on all protected categories/channels (`02` through `09`).
   - Unverified members **cannot** access `02`–`09` even if given another role prematurely (enforced by verification gate + `evaluateEffectiveChannelAccess()` permission audit).
   - `🌱 Recruit` and ordinary clan ranks (`🖤 ShadowSlayer`, `🔥 Elite Warrior`) are explicitly excluded from `👑 07 — THE INNER SANCTUM`.
   - `🧙 05 — CLASS HALLS` channels isolate `⚔️ Warrior`, `🔮 Sorcerer`, and `🗡️ Swordsman` to their own hall (plus leadership audit).
   - Language & Notification roles grant **zero** moderation or leadership privileges.
2. **Discord Native Membership Screening Note**: If a guild enables Discord's native **Membership Screening / Rules Screening**, Discord restricts newcomers' chat/reaction capabilities until native screening completes. ShadowSlayers onboarding (`📜 01 — GATE OF SHADOWS` + `✅ Verified`) works alongside native screening and logs explicit verification completion.
3. **Least-Privilege Bot Permissions**: `/setup` NEVER grants the Discord `Administrator` permission to newly created roles (`permissions: []`) and documents minimal bot permissions (`ManageRoles`, `ManageChannels`, `ModerateMembers`, `KickMembers`, `BanMembers`, `ManageMessages`, `SendMessages`, `EmbedLinks`).

---

## 5. Role-Selection Groups vs. Clan Hierarchy

| Group | Mode | Roles | Notes |
| :--- | :--- | :--- | :--- |
| **Language** | **Exclusive** (`language_exclusive`) | `🇬🇧 English`, `🇷🇺 Русский` | Selecting one removes the other in legacy panel; independent of Clan Rank |
| **Class** | **Exclusive** (`class_exclusive`) | `⚔️ Warrior`, `🔮 Sorcerer`, `🗡️ Swordsman` | Selecting one removes sibling class roles; unlocks matching Class Hall |
| **Notifications** | **Multiple** | `📢 Event Pings`, `🐉 Boss Pings`, `🏆 PvP Pings` | Toggle independently on/off |
| **Clan Hierarchy** | **Leadership-Only** | `👑 Shadow King` .. `🌱 Recruit` | NEVER self-assignable via role panels; blocked in `applySelfRoleSelection()` and `handleRolePanelButton()` |

---

## 6. Setup Workflow Comparison & Audit Findings on Pre-Audit `main`

### Critical Defects Identified on `main`
1. **Unprefixed Role & Incomplete Category Names**: `main` expected unprefixed names (`Shadow King`, `Gate of Shadows`, only 7 categories), missing `🧙 05 — CLASS HALLS`, `🏰 09 — CLAN VOICE`, Class roles (`⚔️ Warrior`, `🔮 Sorcerer`, `🗡️ Swordsman`), and Notification roles (`📢 Event Pings`, `🐉 Boss Pings`, `🏆 PvP Pings`). Matching failed against existing emoji-prefixed server resources and risked creating duplicates.
2. **No Conflict / Ambiguity Rejection**: `main` lacked controlled alias matching and multi-candidate conflict rejection (`conflicting` state), and did not record role permissions/positions, channel overwrites, or uncategorized channels.
3. **Premature `applied: true` Reporting**: `main`'s `/api/guild/:guildId/discovery/confirm` marked `change.applied = true` in JSON even when no Discord bot was connected and zero Discord API calls ran.
4. **Missing Ephemeral `/setup` Interaction Flow**: `/setup` on `main` returned a static text message instead of an ephemeral initiator-locked interactive flow (`Missing only`, `Full setup`, `Cancel`, two-step confirmation, resource re-fetch, partial-failure retry).
5. **Incompatible Language Panel Group**: `main` defaulted the language panel to `multiple` instead of legacy `exclusive`, and omitted default Class & Notification panels in seed.
6. **Critical Discord OAuth2 Authorization Bypass (`server.ts:365`)**: `matchedMember?.clanRank ?? 'Shadow Council'` silently granted **Shadow Council** admin privileges to any arbitrary Discord user authenticating via OAuth2, without verifying guild membership or live Discord roles.
7. **Wildcard `postMessage('*', ...)` & Over-Broad Origin Check**: `server.ts` posted session tokens to `'*'` and `AuthGate.tsx` accepted any `.run.app` or `.github.io` origin.
8. **Prohibited AI Dependency Present**: `@google/genai: ^2.4.0` was still installed in `package.json`.
9. **Moderation / Role Publish Simulation Masking Live Failures**: Moderation actions created DB cases without executing Discord API calls or distinguishing `verified_live` vs `dry_run_no_bot` vs `failed`.
10. **Database Adapter Production Safety Gap**: Needed strict non-fallback enforcement when `firestore`/`supabase` is requested without provisioned drivers.
11. **Missing Schema Migration for v1 -> v2**: Old `.data/shadowslayers-db.json` snapshots needed clean deterministic upgrade to emoji-prefixed ranks and Phase 0.1 fields.

---

## 7. Exact Corrective Actions Implemented (This Branch)

| Area | Corrective Action Implemented | Files |
| :--- | :--- | :--- |
| **Canonical Legacy Template** | Created `LEGACY_SERVER_TEMPLATE` with all 16 roles, 9 categories, 25 channels, controlled aliases, and access classifications | `packages/shared/src/legacy-template.ts`, `packages/shared/src/types.ts` |
| **Discovery & Additive Setup** | Implemented exact + controlled alias resolver, multi-candidate `conflicting` blocker, permission/position/overwrite snapshots, uncategorized channel tracking, 9 lifecycle states, and `executeAdditiveSetupOnDiscordGuild()` marking `applied` ONLY after verified Discord ID return | `apps/bot/src/services/discovery.ts` |
| **Interactive `/setup` Command** | Implemented ephemeral `/setup` workflow with `Missing only`, `Full setup` (2-step confirm), `Cancel`, `Retry Failed Items Only`, initiator-only lock, pre-write permission/resource re-fetch, and audit logging | `apps/bot/src/commands/setup.ts`, `apps/bot/src/index.ts` |
| **Role Selection & Permission Model** | Enforced exclusive Language & Class panels, multi-select Notifications, leadership-only Clan Rank blocking, bot role-position checks, and Discord OR-combination channel access evaluator | `packages/permissions/src/hierarchy.ts`, `packages/database/src/seed.ts` |
| **OAuth2 Default-Deny & Origin Hardening** | Removed `?? 'Shadow Council'` default; implemented `resolveAuthorizedDiscordOAuthSession()` requiring verified guild membership + leadership role; restricted `postMessage` & CORS to configured `APP_URL`/`ALLOWED_ORIGINS` | `packages/permissions/src/oauth-authz.ts`, `server.ts`, `src/components/AuthGate.tsx`, `packages/config/src/env.ts` |
| **Real Discord Execution Reporting** | Wired `/roles publish` and moderation actions to live Discord Guild executors when connected, recording `verified_live` / `dry_run_no_bot` / `failed` transparently | `apps/bot/src/commands/registry.ts`, `apps/bot/src/index.ts`, `server.ts`, `src/components/views/*` |
| **Zero AI Removal** | Removed `@google/genai` from `package.json` and `node_modules` | `package.json` |
| **DB Non-Fallback & Migration** | Enforced explicit error when `firestore`/`supabase` requested without SDK credentials; added v1->v2 data migration | `packages/database/src/adapter.ts`, `database/schema-migrations.ts` |

---

## 8. Verification Status & Honest Separation

- **Automated Unit & Mocked-Discord Integration Tests (`tests/platform.test.ts`)**: Verify matching, conflict blocking, setup state machine, partial-failure retry, permission OR evaluation, OAuth2 default-deny, moderation failure reporting, and DB adapter non-fallback using **mocked Discord API objects** (never represented as live Discord tests).
- **Live-Server Verification Requirements (Pending User Runtime Tokens)**:
  1. Inspect `Wolfyslayer/shadow-slayers-discord-setup` once GitHub access is available to confirm any server-specific channel topics or optional legacy channels.
  2. Connect bot with real `DISCORD_BOT_TOKEN` & `DISCORD_GUILD_ID` on a test guild matching ShadowSlayers roles/categories and verify `/setup` discovery, `Missing only`, `/roles publish`, role-panel button toggles, Class Hall isolation, and live `/timeout` execution end-to-end.
