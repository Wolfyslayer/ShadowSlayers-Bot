# Feature & Command Parity Matrix — ShadowSlayers

> **Honesty Rule:** Automated tests in `tests/platform.test.ts` use **mocked Discord Guild/Role/Channel objects** and a local persistent database adapter. Live Discord Gateway verification against a real Discord server has **not** been executed yet.

| Feature / Command | Legacy Intent | Current Status | Verification Basis |
| :--- | :--- | :--- | :--- |
| **16 Legacy Roles / 9 Categories / 32 Text / 5 Voice** | Canonical server layout | Implemented | `tests/legacy-fixture.ts` + `tests/platform.test.ts` (Passed) |
| **Setup Discovery & Diff Preview (`/setup`)** | Safe, additive, non-destructive setup | Implemented | Mocked Discord Guild tests (Passed) |
| **`👑 Shadow King` Exclusion** | Manual-only top authority role | Implemented | Mocked Discord Guild setup test + `discovery.ts` (Passed) |
| **Rules Gate Publish (`/rules publish`)** | Publish `📜・rules` `✅` reaction gate | Implemented | Command registry + API `/rules/publish` + offline guard (Passed) |
| **5-Step Onboarding (`/onboarding status`, `/onboarding active_player`)** | Rules `✅` -> Language -> Class -> Pings -> `🌱 Recruit` | Implemented | `apps/bot/src/services/onboarding.ts` + unranked null rank tests (Passed) |
| **Role Panels (`/roles list`, `/roles publish`)** | Exclusive Language/Class, multi Notifications | Implemented | `hierarchy.ts` + `registry.ts` + offline guard (Passed) |
| **Permission Preview & Audit (`/permissions preview`, `/permissions matrix`)** | Audit & inspect effective Discord OR-access | Implemented | 10-case access matrix tests + `auditGuildPermissions()` (Passed) |
| **Diagnostics (`/bot-status`, `/server`, `/serverinfo`, `/userinfo`, `/avatar`)** | Live runtime & member/guild inspection | Implemented | `registry.ts` unit tests (Passed) |
| **Moderation (`/warn`, `/timeout`, `/kick`, `/ban`, `/tempban`, `/purge`, `/lock`, `/unlock`, etc.)** | Case-tracked moderation with `confirmed` guard and offline rejection | Implemented | Command tests + live execution status tracking (`verified_live` / `failed`) (Passed) |
| **Rule-Based AutoMod (`/automod status`, `/automod test`, `/false-positive`)** | Deterministic filters, zero AI, never auto-permabans | Implemented | `automod.ts` + `AutoModView.tsx` + unit tests (Passed) |
| **Deterministic Custom Responses (`/custom-response`)** | Keyword/exact/prefix auto-replies (Zero AI) | Implemented | `registry.ts` + `server.ts` + `index.ts` `MessageCreate` (Passed) |
| **Multilingual System (`/language`)** | English + Russian + dynamic admin languages | Implemented | `packages/localization/src/engine.ts` + unit tests (Passed) |
| **Discord Slash Command Options (Phase 0.3)** | Typed Discord.js option builders & subcommands | Implemented | `buildDiscordSlashCommandsJson()` + JSON schema tests (Passed) |
| **Firestore Database Adapter (Phase 0.3)** | Production Firebase Admin SDK with guild isolation | Implemented | `tests/firestore-adapter.test.ts` (4/4 tests passed) |
| **Security Hardening (Phase 0.3)** | Unranked null rank, XSS escape, dynamic OAuth2 revalidation | Implemented | `tests/platform.test.ts` + `walkthrough.md` (Passed) |
| **Tickets, Recruitment, Clan, Community, Scheduler** | Full community & clan governance | Implemented | `server.ts`, `scheduler.ts`, `registry.ts`, dashboard views (Passed) |
| **Live Discord Server End-to-End Test** | Run against real Discord server | Pending | Requires `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, and bot installation in the test guild |
| **Live Cloud Firestore End-to-End Test** | Run against live Firebase Spark project | Pending | Requires `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| **GitHub Remote Origin Push** | Push commit to GitHub `main` | Pending | Requires user-configured GitHub remote origin |

