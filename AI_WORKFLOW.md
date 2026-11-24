# AI_WORKFLOW.md – Development & Maintenance Rules

> **Note**: This document governs how AI coding assistants and human engineers must work inside the **ShadowSlayers – Legends of Elements** repository. It does **NOT** describe any AI feature inside the Discord bot or dashboard (AI features are strictly prohibited in this codebase).

## Mandatory Engineering Workflow

Every contributor or automated coding tool modifying this repository **must** follow these steps in order:

1. **Read the Roadmap (`ROADMAP.md`)**
   - Identify completed phases, in-progress phases, blocked tasks, and acceptance criteria.
2. **Read Architecture & Domain Documentation**
   - Review `docs/LEGACY_COMPATIBILITY_AUDIT.md`, `docs/LEGACY_SERVER_SPECIFICATION.md`, `docs/FEATURE_PARITY.md`, `docs/SETUP_MANAGER.md`, `docs/ROLE_AND_PERMISSION_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/COMMANDS.md`, and `docs/MODULES.md`.
3. **Inspect Existing Code Before Modifying**
   - Never assume file structure or API contracts. Read target modules and shared types in `packages/shared/src/types.ts` before writing changes.
4. **Identify the Current Phase**
   - Anchor every change to a specific roadmap phase and task checkbox.
5. **Identify Dependencies**
   - Verify upstream packages (`shared`, `permissions`, `localization`, `database`, `config`) and database schema migrations before modifying `apps/bot` or `src/`.
6. **Make Focused Changes**
   - Keep edits surgical, modular, and strictly typed with TypeScript and Zod validation.
7. **Avoid Unnecessary Rewrites**
   - Preserve existing working Discord discovery mappings, language data, and permission boundaries. Never auto-delete roles, rename roles, or overwrite channel permissions.
8. **Run Relevant Tests & Typechecks**
   - Execute `npm run lint` (`tsc --noEmit`), `npm test`, `npm run build`, and `npm run security:check` after changes.
   - Always distinguish **automated unit/integration tests** (run locally with mocked fixtures) from **live Discord Gateway / Cloud Firestore tests** (require live user-configured secrets).
9. **Update Documentation & Roadmap**
   - Update checkboxes, completed/remaining/blocked counts, percentage complete, and test status in `ROADMAP.md` after every meaningful task. Never claim external functionality works without live verification.
10. **Target Branch & Lockfile Discipline**
    - Work directly on `main` (never create feature branches or Pull Requests).
    - Maintain valid `package-lock.json` matching `package.json`. CI must always install via `npm ci` (never weaken CI to `npm install`).
11. **Enforce Project Constraints**
    - **No AI Features**: Never introduce `@google/genai`, OpenAI, LLM moderation, or AI translation.
    - **No Secrets in Client/Git**: Never commit `.env`, service account keys, bot tokens, or OAuth secrets.
    - **Non-Destructive Discord Ops**: Always discover, diff-preview, and require explicit confirmation before mutating Discord server structure.

