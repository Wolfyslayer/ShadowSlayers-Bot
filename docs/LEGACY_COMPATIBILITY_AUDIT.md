# Phase 0.2 — Legacy Compatibility Audit & Gap Resolution

**Repository:** `Wolfyslayer/ShadowSlayers-Bot`  
**Target Branch:** `main`  
**Specification Source of Truth:** Phase 0.2 Legacy Reconstruction Specification (the legacy repository `Wolfyslayer/shadow-slayers-discord-setup` is not accessible from this sandbox environment; no unverified legacy properties were invented).

---

## 1. Transparency on Legacy Access & Unknown Properties

1. **Legacy Repository Access:** `Wolfyslayer/shadow-slayers-discord-setup` could not be accessed from this environment. Therefore, Phase 0.2 reconstructs the exact server template, roles, categories, channels, onboarding workflow, and command parity strictly from the verified Phase 0.2 specification.
2. **Unknown Legacy Properties Preserved Safely (`null` / Review-Required):**
   - Exact Discord role hex colors (`colorHex: null`)
   - Role hoist flags (`hoist: null`)
   - Exact legacy Discord role ordering positions outside the 6-tier Clan Hierarchy (`👑 Shadow King > 🛡️ Shadow Council > ⚔️ Warlord > 🔥 Elite Warrior > 🖤 ShadowSlayer > 🌱 Recruit`)
   - Fine-grained legacy role permissions (`permissionsBitfield: '0'`, `intendedPermissions: []`) — automated setup **never** guesses or grants privileged permissions (`Administrator`, `ManageGuild`, `ManageRoles`, `BanMembers`, etc.).
3. **Manual-Only Role Guard:** `👑 Shadow King` carries `excludeFromAutoSetup: true` and `lifecycleState: 'requires_manual_setup'`. Automated setup maps it when present, flags it for manual administrator setup when absent, and **never** creates or elevates `👑 Shadow King`.

---

## 2. Reconstructed Legacy Resource Inventory

| Resource Group | Canonical Legacy Count | Details |
| :--- | :---: | :--- |
| **Roles** | **16** | 6 Clan Hierarchy (`👑 Shadow King`, `🛡️ Shadow Council`, `⚔️ Warlord`, `🔥 Elite Warrior`, `🖤 ShadowSlayer`, `🌱 Recruit`), 3 Classes (`⚔️ Warrior`, `🔮 Sorcerer`, `🗡️ Swordsman`), 3 Notifications (`📢 Event Pings`, `🐉 Boss Pings`, `🏆 PvP Pings`), 2 Languages (`🇬🇧 English`, `🇷🇺 Русский`), 2 System/Verification (`🤖 Bots`, `✅ Verified`) |
| **Categories** | **9** | `📜 01 — GATE OF SHADOWS` through `🏰 09 — CLAN VOICE` |
| **Text Channels** | **32** | 6 Gate + 5 Common Hall + 2 Language Realms + 6 Legends of Elements + 3 Class Halls + 6 ShadowSlayers + 4 Inner Sanctum |
| **Voice Channels** | **5** | 4 in `🔊 08 — VOICE CHAMBERS` + 1 in `🏰 09 — CLAN VOICE` |
| **Optional Extensions** | **2** (strictly separated) | `📜・audit-logs`, `💡・suggestions` — stored in `OPTIONAL_EXTENSION_CHANNELS` / `discovery.optionalChannels`, never mixed into canonical legacy counts |

### Canonical Anomaly / Alias Note (`🏰・clan-announcements` vs `👑・clan-announcements`)
- Section 4.6 of the specification defines `🏰・clan-announcements` under `🖤 06 — SHADOWSLAYERS`, whereas Section 7.7 references `👑・clan-announcements` as read-only for ordinary clan members.
- The canonical template uses `🏰・clan-announcements` with `readOnlyForMembers: true` and includes `'👑・clan-announcements'` in channel aliases so either name maps non-destructively without duplicating channels.

---

## 3. Gaps Found Between Phase 0.1 and Phase 0.2 Spec & Corrective Actions Applied

| Area | Phase 0.1 Deviation | Phase 0.2 Corrective Action |
| :--- | :--- | :--- |
| **Template Channels** | Only 25 channels; had invented `common-hall`, `role-selection`, `announcements`, `suggestions`, `audit-logs` inside core categories | Replaced with exact **32 text + 5 voice** legacy channels across 9 categories; moved `📜・audit-logs` and `💡・suggestions` to separate `OPTIONAL_EXTENSION_CHANNELS` |
| **Role Selection Channels** | Single `'role-selection'` channel | Both `🎭・choose-your-role` and `🎭・выбор-ролей` in `📜 01 — GATE OF SHADOWS` |
| **Moderation Log Channel** | Referenced `'mod-log'` | Routed to canonical `🛡️・moderation-log` in `👑 07 — THE INNER SANCTUM` |
| **Role Colors & Privileges** | Invented hex colors (`#F59E0B`, `#3B82F6`, etc.) and auto-created `👑 Shadow King` | Set `colorHex: null`, `hoist: null`, `requiresAdminReview: true` on all 16 roles; marked `👑 Shadow King` `excludeFromAutoSetup: true` (`requires_manual_setup`) |
| **Onboarding Flow** | Only basic rules flag; auto-defaulted members to `🌱 Recruit` | Implemented full 5-step onboarding (`apps/bot/src/services/onboarding.ts`) with `📜・rules` `✅` reaction add/remove, deliberate removal policy, dynamic role-based derivation, and gated Step 5 active-player `🌱 Recruit` action |
| **Cross-Category Discovery** | Only checked channels within expected parent category | Added cross-category scan detecting `incorrectPlacements`, `incorrectTypes`, and `permissionDifferences` without moving or overwriting existing Discord resources |
| **Command Parity** | Missing `/rules publish`, `/permissions preview`, `/bot-status`, `/automod status`, `/automod test`, `/onboarding`, `/serverinfo`, `/userinfo`, `/avatar`, `/custom-response`, `/false-positive`, confirmation guards on `ban`/`kick`/`purge` | Added all commands/subcommands/aliases and destructive confirmation guards in `apps/bot/src/commands/registry.ts` |
| **Schema Version** | `schemaVersion: 2` | Upgraded to `schemaVersion: 3` in `database/schema-migrations.ts` and `packages/database/src/seed.ts` |

---

## 4. Verification Status Summary

- **Automated Verification (Unit + Mocked Discord API):** Verified in `tests/platform.test.ts` and `tests/legacy-fixture.ts` (all 10 role combination access cases, 5-step onboarding, misplacement/type/permission-diff discovery, `👑 Shadow King` exclusion, partial failure retry, idempotency, command parity, and schema v3 migration).
- **Live Discord Server Verification:** **Not yet executed** in this environment (requires live `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and a real test Discord server).
