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
6. The owner has granted standing approval to merge completed phases that meet every roadmap acceptance criterion and have green CI. Production deployment, slash-command publication, live service changes and production-data changes still require separate explicit owner approval.
7. After an approved merge, tell the user whether they need to run `git pull origin main` and whether a bot rebuild/re-upload or dashboard/API deployment is required.
8. Break every phase into explicit main tasks and subtasks, and keep a complete phase checklist in progress reports.
9. Update `ROADMAP.md` in every commit so repository status and the commit's actual verification state stay synchronized.
10. After pushing each commit, verify GitHub Actions for that exact commit. Continue automatically within the active phase only after CI is green; investigate and fix failures before proceeding.
11. Never weaken, skip, or delete tests or security checks merely to make CI pass. Add regression coverage for every defect discovered.
12. Report every commit before continuing. Merge a completed phase under the standing approval and start the next phase once the merge is on `main`.
13. Consolidate manual live acceptance tests in Phase 1.5 as requested by the owner. For earlier phases, record the specific deferred scenarios before merging, require implementation and green automated checks, and report live verification as pending. Phase 1.5 must pass the consolidated live suite before release.

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
   - active phase, PR number and full commit ID,
   - what changed,
   - the complete list of files changed,
   - tests run and results,
   - CI status for that commit,
   - phase checklist (completed/total and percentage),
   - outstanding risks or blockers.
5. Show separate, truthful progress bars for main tasks and subtasks using `█████░░░░░ 5/10 (50%)` style. Count only work actually completed.
6. Distinguish clearly between implemented, automatically tested, verified in a real service, reviewed/approved, and deployed. Code presence or mock-only tests never prove live functionality.
7. At phase completion, publish an update matrix with YES/NO for: new bot build, Lunafy upload, bot restart, Cloud Run API deploy, dashboard deploy, Firebase changes, database migration, new environment variables, Discord permission changes, and manual functional tests.
8. Give exact mobile-friendly Android instructions for every owner action, including build download/upload, deployment approval, rollback, provider configuration, and verification.

## 8. Deployment and release controls
1. Production workflows must be manual (`workflow_dispatch`). Never add an automatic production deployment.
2. Production Cloud Run deployment is allowed only from `main`, must use a protected GitHub `production` environment, must prevent concurrent deployments, and must use GitHub OIDC/Google Workload Identity Federation with least privilege. Never use a service-account key.
3. Preserve the existing hosting split: Lunafy for the bot, Cloud Run for the API, the existing dashboard host, and Firestore for persistence. Do not change hosting, domain, DNS, Cloudflare, service URL, runtime identity, secrets, environment variables, scaling, or other production configuration unless the phase requires it and the owner explicitly approves it.
4. A Cloud Run image-only deployment must target project `shadowslayers-7f48f`, service `shadowslayers-api`, region `europe-west4`, preserve service configuration, verify `/api/health`, and document revision rollback.
5. A Lunafy artifact must be built with Node.js 22 and `npm ci`, pass security/type/test/startup gates, use `MAIN_FILE=dist-bot/index.js`, include `dist-bot`, `package.json`, `package-lock.json`, and only required runtime files, and exclude `node_modules`, secrets, keys, `.env` files, tests, and development-only sources.
6. No Codex/CI access to Google Cloud, Firebase, Discord, or Lunafy credentials is required. Live deployment and live tests remain owner-approved, separately reported operations.
7. Never create new recurring costs without explicit owner approval. Apply least privilege and prefer reversible, low-cost operations.

## 9. Product requirements
1. Remove mock/demo data from production paths and dashboard behavior; fixtures may exist only in isolated tests. New guilds start empty and use real Discord state.
2. Keep every guild's settings, members, modules, commands, roles, permissions, jobs, logs, and data strictly isolated. Convert ShadowSlayers-specific behavior into generic behavior or optional modules/templates.
3. Dashboard features must work end-to-end across UI, API, persistence, queue/bot, and Discord, with truthful status at every boundary.
4. A new installation must receive one safe welcome message. `/setup` must use a secure, short-lived handoff that authenticates the correct user and preselects only an authorized guild.
5. The server template maker must support create, edit, preview/diff, and safe idempotent application. Administrators must be able to enable/disable modules and built-in commands independently per guild.
6. Custom commands must be source-code-free, guild-scoped, validated, auditable, and restricted to allowlisted actions. Preserve and improve multilingual support.
7. Do not add AI or LLM functionality to the bot or dashboard.

## 10. Project constraints
- No AI/LLM features, AI moderation, AI translation or AI dependencies.
- Never commit secrets or production data.
- Keep the current hosting arrangement unless a roadmap task and explicit user approval authorize a change.
- Prefer low-cost, reversible changes and avoid unnecessary rewrites.
- Preserve user data and existing server structures by default.
- Never delete or overwrite production data without a verified backup, documented record-level migration plan, and explicit owner approval.
