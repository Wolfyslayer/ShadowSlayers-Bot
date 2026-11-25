# Platform audit – ShadowSlayers Bot

**Audit date:** 2026-11-25  
**Scope:** repository source and documentation review. This is a static code audit; it does not claim a live Discord, Firestore, Lunafy or Cloud Run test.

## Executive summary

The repository contains a substantial ShadowSlayers-specific bot and dashboard baseline, but it is not yet a clean generic multi-guild platform. Several dashboard operations persist configuration or records without completing the expected Discord-side effect. The most important prerequisite is to stop production demo seeding and introduce a genuinely empty guild state before adding the server builder and custom commands.

## Architecture observed

- Discord Gateway bot: standalone Node process in `apps/bot`; current hosting is Lunafy.
- Trusted API: Express service in `server.ts`, deployed separately on Google Cloud Run.
- Dashboard: static React/Vite application, deployed separately.
- Persistence: database adapter abstraction with Firestore support and per-guild state.
- Bot/API control: signed Firestore-backed control queue; the API cannot directly perform Gateway-only actions.
- CI has separate quality, bot-build/startup and dashboard-build jobs.

This split is a sound starting point. Keep it; no hosting migration is required for the planned product redesign.

## Confirmed findings

### 1. Production seed creates a legacy/demo guild

`packages/database/src/seed.ts` exports `createInitialGuildSeed()`. It builds the fixed legacy role/category/channel layout and populates sample language configuration and other example content. The seed includes fabricated members, onboarding records, moderation cases, logs, community activity and other demo-like records.

Production paths call this factory:
- OAuth guild selection in `server.ts` creates and saves the seed when a guild record does not exist.
- `FirestoreDatabaseAdapter.init()` seeds a configured default guild when missing.
- The local adapter also has a default-guild seed path.

The factory also defaults to `shadowslayers-primary` / `ShadowSlayers`. This must be split into a minimal empty production factory and explicitly test-only fixtures.

**Data safety:** do not delete existing Firestore records automatically. First stop new seed creation, export a backup, identify records by stable provenance/IDs and present a cleanup plan. Genuine user/member/moderation history must be preserved.

### 2. Dashboard has a hardcoded guild fallback

`src/App.tsx` derives the active guild using `user?.guildId || 'shadowslayers-primary'`. Missing auth or selection must instead produce an explicit unauthenticated/no-guild state. Never silently load a default tenant.

### 3. Member lifecycle is incomplete

The bot handles `GuildMemberUpdate` and `GuildMemberRemove`, but the inspected event wiring contains no `GuildMemberAdd` handler. The current role sync looks up an existing database member and returns if none exists. This means a new/previously unknown member can be skipped rather than created.

The leave path marks a member departed and clears active rank/verification fields, which is useful for preserving history. The dashboard overview filters departed members, but the member list does not consistently apply the same active-member filter.

A complete solution needs initial member enumeration, join creation, update reconciliation, leave preservation, rejoin restoration and reconnect recovery.

### 4. Module toggles are storage-only in important places

`GuildModulesConfig` contains module booleans. `SettingsView` updates them and the API merges them into guild state. However:
- navigation is hardcoded in `src/App.tsx`;
- there is no consistent module guard across navigation, API routes, slash commands, Gateway listeners and scheduled work;
- settings still exposes a fixed clan-rank permission matrix.

A module system must be enforced end-to-end and must use guild-specific capabilities rather than fixed clan ranks.

### 5. Dashboard operations with misleading or incomplete behavior

- The manual scheduler endpoint returns HTTP 503 because the scheduler belongs to the persistent bot process. The dashboard control must be removed or routed through an authenticated bot-control queue.
- The command page is a command executor/test runner, not a custom slash-command builder.
- The existing `/setup` is tied to the legacy server template and is not the secure dashboard handoff requested for new guilds.
- Guild installation currently synchronizes guild state and command registration but does not send the requested welcome/setup message.
- Existing server discovery/setup is based on fixed legacy role/category/channel specifications. It should be retained only as an optional legacy template after the generic template system exists.

### 6. Security foundation worth preserving

The API checks the session, verifies the target guild is among the user's authorized guilds, rechecks live Discord guild access, and checks manager/capability requirements. The API-to-bot control path uses signed commands and the Gateway process owns Discord operations.

Keep these server-side checks. The setup handoff must use a short-lived, single-use ticket exchanged server-side for a session. Never trust a guild ID or permission claim supplied by the browser, and never place long-lived bearer tokens in a URL.

### 7. API and feature coverage

The API contains routes for discovery, languages, members, role panels, rules, onboarding, moderation, AutoMod, custom responses, logging, tickets, recruitment, community, clan/gaming, settings, command execution and backup export.

A route existing does not prove that a UI workflow is fully functional. The audit must continue by tracing every route through authorization, persistence, control-queue dispatch, bot handler and verified Discord response. UI actions that only save data must be labelled as configuration-only until the execution path is implemented.

### 8. Tests and CI

The CI workflow runs npm install verification, security hygiene, npm audit, TypeScript checks, tests, standalone bot build/startup validation and dashboard build. Existing tests cover many permission, setup, AutoMod, progression, scheduler and command behaviors using mocks/fixtures.

These tests are useful but are not equivalent to live Discord Gateway or live Firestore tests. The current test suite also preserves exact ShadowSlayers role/template assumptions, so new generic multi-guild tests must be added rather than simply deleting legacy tests.

### 9. Documentation/workflow drift

- `AI_WORKFLOW.md` instructs contributors to work directly on `main` and never use PRs. This conflicts with the agreed workflow and has been corrected in this documentation update.
- `ROADMAP.md` describes legacy ShadowSlayers phases as the current roadmap and contains stale deployment/test status. The legacy history is retained, but the new platform phases are now the active roadmap.
- Some phase descriptions mark dashboard functions complete while separately acknowledging missing live API/bot control verification. The new acceptance criteria distinguish code presence, automated tests and live verification.

## Recommended implementation order

1. **Phase 0.5:** empty production guild factory; stop demo seed paths; remove default guild fallback; preserve existing Firestore data.
2. **Phase 0.6:** reliable real-member synchronization and consistent active/departed filtering.
3. **Phase 0.7:** trace and repair every dashboard action and API/bot operation.
4. **Phase 0.8:** generic per-guild module/permission model and modular bot boundaries.
5. **Phase 0.9:** welcome message, private `/setup` and secure dashboard handoff.
6. **Phase 1.0:** visual empty-first server template maker with diff/preview and explicit apply.
7. **Phase 1.1:** per-guild built-in module and command selection.
8. **Phase 1.2:** safe custom command builder with allowlisted actions.
9. **Phase 1.3:** reusable templates and automation builder.
10. **Phases 1.4–1.5:** security, reliability, two-guild end-to-end QA and release.

## Not changed by this audit

No bot deployment, API deployment, dashboard hosting, DNS/domain, Lunafy configuration, Cloud Run configuration or Firestore data was changed. No production data was deleted. This PR is documentation-only.
