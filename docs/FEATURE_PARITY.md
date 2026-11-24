# Feature & Command Parity Matrix — ShadowSlayers

> **Honesty Rule:** Automated tests in `tests/platform.test.ts` use **mocked Discord Guild/Role/Channel objects** and a local persistent database adapter. Live Discord Gateway verification against a real Discord server has **not** been executed yet.

| Feature / Command | Legacy Intent | Current Status | Verification Basis |
| :--- | :--- | :--- | :--- |
| **16 Legacy Roles / 9 Categories / 32 Text / 5 Voice** | Canonical server layout | Implemented | `tests/legacy-fixture.ts` + `tests/platform.test.ts` |
| **Setup Discovery & Diff Preview (`/setup`)** | Safe, additive, non-destructive setup | Implemented | Mocked Discord Guild tests (missing, conflict, misplacement, type mismatch, permission diff, retry, idempotency) |
| **`👑 Shadow King` Exclusion** | Manual-only top authority role | Implemented | Mocked Discord Guild setup test + `discovery.ts` |
| **Rules Gate Publish (`/rules publish`)** | Publish `📜・rules` `✅` reaction gate | Implemented | Command registry + API `/rules/publish` + `publishRulesToDiscord()` |
| **5-Step Onboarding (`/onboarding`)** | Rules `✅` -> Language -> Class -> Pings -> `🌱 Recruit` | Implemented | `apps/bot/src/services/onboarding.ts` + unit tests |
| **Role Panels (`/roles list`, `/roles publish`)** | Exclusive Language/Class, multi Notifications | Implemented | `hierarchy.ts` + `registry.ts` + `RolesView.tsx` |
| **Permission Preview & Audit (`/permissions preview`, `/permissions matrix`)** | Audit & inspect effective Discord OR-access | Implemented | 10-case access matrix tests + `auditGuildPermissions()` |
| **Diagnostics (`/bot-status`, `/server`, `/serverinfo`, `/userinfo`, `/avatar`)** | Live runtime & member/guild inspection | Implemented | `registry.ts` unit tests |
| **Moderation (`/warn`, `/timeout`, `/kick`, `/ban`, `/tempban`, `/purge`, `/lock`, `/unlock`, etc.)** | Case-tracked moderation with `confirmed` guard on destructive actions | Implemented | Command tests + live execution status tracking (`verified_live` / `dry_run_no_bot` / `failed`) |
| **Rule-Based AutoMod (`/automod status`, `/automod test`, `/false-positive`)** | Deterministic filters, zero AI, never auto-permabans | Implemented | `automod.ts` + `AutoModView.tsx` + unit tests |
| **Deterministic Custom Responses (`/custom-response`)** | Keyword/exact/prefix auto-replies (Zero AI) | Implemented | `registry.ts` + `server.ts` + `index.ts` `MessageCreate` |
| **Multilingual System (`/language`)** | English + Russian + dynamic admin languages | Implemented | `packages/localization/src/engine.ts` + unit tests |
| **Tickets, Recruitment, Clan, Community, Scheduler** | Full community & clan governance | Implemented | `server.ts`, `scheduler.ts`, `registry.ts`, dashboard views |
| **Live Discord Server End-to-End Test** | Run against real Discord server | Pending | Requires `DISCORD_BOT_TOKEN` & `DISCORD_GUILD_ID` |
