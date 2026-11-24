# Setup Manager — Non-Destructive Discovery & Additive Execution

Located in `apps/bot/src/services/discovery.ts` and `apps/bot/src/commands/setup.ts`.

---

## 1. Core Safety Guarantees

1. **Zero Destructive Writes:** Setup **never** deletes roles, renames existing roles, deletes channels, reorders existing categories/roles, or strips existing Discord permission overwrites.
2. **Manual-Only `👑 Shadow King`:** `👑 Shadow King` has `excludeFromAutoSetup: true` and transitions to `requires_manual_setup` if absent on Discord. Automated setup never creates or grants it.
3. **Unknown Property Restraint:** Missing auto-creatable roles are created with neutral Discord defaults (`color: undefined`, no invented hex colors, no automatic privileged permissions).
4. **Controlled Alias Matching & Conflict Blocking:** Matches exact canonical name (case-insensitive trimmed) first, then controlled aliases. If 2+ candidates match, status becomes `conflicting` and automated mutation is blocked until an administrator resolves the ambiguity in Discord.

---

## 2. Discovery Audit Checks

During `discoverLiveDiscordGuild()`, the scanner checks:
- **Missing Roles & Categories & Channels** (`missing` / `proposed`)
- **Misplaced Channels (`incorrectPlacements`):** Legacy channel found in a different parent category than expected. Reported as a warning; setup does **not** move or duplicate it.
- **Channel Type Mismatches (`incorrectTypes`):** E.g., `📢・announcements` exists as `text` instead of `announcement`, or vice versa. Reported as a diff finding; setup does **not** recreate it.
- **Permission Drift (`permissionDifferences`):**
  - Protected categories (`02`–`09`) missing `@everyone ViewChannel` deny.
  - `👑 07 — THE INNER SANCTUM` granting `ViewChannel` to non-leadership roles.
  - Read-only channels (`📜・rules`, `👋・welcome`, `📢・announcements`, `📌・important-info`, `🎭・choose-your-role`, `🎭・выбор-ролей`, `🏰・clan-announcements`, `📋・clan-roster`) missing `@everyone SendMessages` deny.
  - `🧙 05 — CLASS HALLS` missing `@everyone ViewChannel` deny.
- **Optional Non-Legacy Channels (`optionalChannels`):** `📜・audit-logs` and `💡・suggestions` are tracked separately from the 32 text + 5 voice legacy channels.

---

## 3. Ephemeral Initiator-Locked `/setup` Workflow

1. `/setup` creates an ephemeral `SetupSession` bound to `initiatorUserId`. Any other user clicking its buttons receives a rejection.
2. **Missing only (`setup:missing:<id>`):** Creates only missing auto-creatable resources. If partial Discord API errors occur, failed items stay `failed` and a `Retry failed items` button (`setup:retry:<id>`) appears while already-created items are skipped on retry.
3. **Full setup (`setup:full_preview:<id>` -> `setup:full_confirm:<id>`):** Requires explicit two-step confirmation before executing additive creation.
4. **Verified-ID Lifecycle:** A change only transitions to `applied` after Discord returns a real `id`. Standby DB confirmations without a live Discord Gateway stay `confirmed` (never falsely `applied`).
5. **Idempotency:** Running setup again after all auto-creatable resources exist results in `appliedCount === 0` and zero duplicates.
