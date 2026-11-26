# AI_WORKFLOW.md – Development & Maintenance Rules

> This file governs coding assistants and human contributors. “AI workflow” means the development process only. **Do not add AI/LLM features** to the Discord bot or dashboard.

## 1. Start with repository context
1. Read `ROADMAP.md` and identify the active phase, checked tasks, blockers and acceptance criteria.
2. Read the relevant architecture, security, database, command, module and legacy-compatibility documents.
3. Inspect the actual source, shared types, tests and API contracts before editing. Never rely on UI labels or roadmap claims alone.
4. Search for existing implementations before creating new abstractions. Preserve working behavior unless the active phase explicitly replaces it.

## 2. Branch and pull-request workflow
1. Never work directly on `main`.
2. Create one focused feature branch and one pull request per roadmap phase.
3. Keep commits meaningful and scoped to the phase. Do not bundle unrelated cleanup or future-phase work.
4. After each commit, report the phase checklist with checked/unchecked tasks, completed count, total count and percentage.
5. Run the relevant checks after each meaningful commit. Wait for normal GitHub Actions CI to pass before making the next commit.
6. Do not merge a pull request, deploy, publish slash-command changes or perform live service changes without explicit user approval.
7. After an approved merge, tell the user whether they need to run `git pull origin main` and whether a bot rebuild/re-upload or dashboard/API deployment is required.

## 3. Data and multi-guild safety
1. Treat every guild as an isolated tenant. Every database query, queue item, cache key, scheduled task, log and command must be scoped to a verified `guildId`.
2. Never use a default/demo guild as a fallback for missing authentication or guild selection.
3. Production initialization must create empty, schema-valid state—not fixture members, fake logs, example moderation cases or sample activity.
4. Test fixtures belong only in tests and must not be imported by production runtime code.
5. Never delete or rewrite existing Firestore data as part of a migration without an export/backup, a record-level plan and explicit user approval.
6. Preserve departed-member history for audit purposes while excluding departed users from active lists and counts.
7. Do not log tokens, OAuth codes, service-account keys, private keys, session secrets or one-time setup tickets.

## 4. Discord operations
1. Revalidate the acting user's Discord identity, guild membership and required permissions server-side for every sensitive operation.
2. Treat browser-provided guild IDs, role IDs, channel IDs and permission claims as untrusted input.
3. Preview/diff and require explicit confirmation before changing server structure or permissions.
4. Never delete/rename existing roles or channels or overwrite permission structures without a distinct explicit confirmation.
5. Use idempotency keys, bounded retries and clear partial-failure reporting for Discord writes.
6. Distinguish “queued”, “executed”, “verified” and “failed”. Never report success before Discord confirms the operation.
7. Respect Discord rate limits and required Gateway intents; request only intents needed by enabled features.

## 5. API, queue and module contracts
1. Validate external input with Zod (or the repository's established schema layer).
2. Keep trusted API operations separate from Gateway-only operations. The API must enqueue authenticated, signed, guild-scoped commands when a live Gateway action is required.
3. Every queue operation must have a typed payload, authorization capability, guild binding, expiry, idempotency strategy, result state and audit record.
4. Module enablement must be enforced in navigation, API routes, slash commands, event listeners and scheduled handlers—not only stored in settings.
5. A disabled module must not continue processing events or scheduled work, except cleanup needed to safely disable it.
6. Custom commands must use a constrained, allowlisted action model. Never evaluate arbitrary JavaScript or execute user-supplied code.

## 6. Code quality and verification
1. Keep changes modular, strictly typed and consistent with existing conventions.
2. Update schema migrations and compatibility tests when persisted types change.
3. Run the checks relevant to the change; before a phase PR is ready, run:
   - `npm ci`
   - `npm run security:check`
   - `npm audit --audit-level=high`
   - `npm run lint`
   - `npm test`
   - `npm run build:bot`
   - `npm run build:api`
   - `npm run build:dashboard`
   - `npm run check:bot-startup`
4. Add regression tests for every bug fixed and negative tests for authorization/security boundaries.
5. Clearly label tests using mocks/fixtures. Never describe them as live Discord or live Firestore verification.
6. Do not claim a feature works end-to-end until the real integration path has been tested.

## 7. Documentation and progress
1. Update `ROADMAP.md` as tasks are completed; keep phase status, blockers, counts and acceptance criteria truthful.
2. Update architecture/API/database/security/command/module docs when contracts change.
3. Record operational requirements and whether a bot rebuild, API deployment or dashboard deployment is required.
4. Report each commit with:
   - what changed,
   - files changed,
   - tests run and results,
   - phase checklist (completed/total and percentage),
   - outstanding risks or blockers.

## 8. Project constraints
- No AI/LLM features, AI moderation, AI translation or AI dependencies.
- Never commit secrets or production data.
- Keep the current hosting arrangement unless a roadmap task and explicit user approval authorize a change.
- Prefer low-cost, reversible changes and avoid unnecessary rewrites.
- Preserve user data and existing server structures by default.
