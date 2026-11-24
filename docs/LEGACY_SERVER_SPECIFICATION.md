# Legacy Server Specification — ShadowSlayers Bot Community Template

This document records the canonical **16 roles**, **9 categories**, **32 text channels**, and **5 voice channels** reconstructed from the Phase 0.2 specification.

---

## 1. Exact Legacy Roles (16 Total)

### 1.1 Clan Hierarchy (Never Self-Assignable)
Order from highest authority to entry rank:
1. `👑 Shadow King` — Highest authority (`excludeFromAutoSetup: true`, manual setup only)
2. `🛡️ Shadow Council` — Senior leadership
3. `⚔️ Warlord` — Clan leadership / operational authority
4. `🔥 Elite Warrior` — Senior clan member
5. `🖤 ShadowSlayer` — Clan member
6. `🌱 Recruit` — Active member / recruit (granted ONLY via Step 5 active-player confirmation after Steps 1–3)

### 1.2 Class Roles (Exclusive: Max 1 Active)
- `⚔️ Warrior`
- `🔮 Sorcerer`
- `🗡️ Swordsman`

### 1.3 Notification Roles (Optional, Multi-Select)
- `📢 Event Pings`
- `🐉 Boss Pings`
- `🏆 PvP Pings`

### 1.4 Language Roles (Exclusive: Max 1 Active)
- `🇬🇧 English`
- `🇷🇺 Русский`

### 1.5 System & Verification Roles
- `🤖 Bots` — Bot role (never self-assignable)
- `✅ Verified` — Granted after accepting rules in `📜・rules` via `✅` reaction

> **Unknown Legacy Properties Policy:** Role hex colors (`colorHex`), hoist flags (`hoist`), and privileged permissions are NOT invented (`null` / `requiresAdminReview: true`).

---

## 2. Exact Categories (9) & Channels (32 Text + 5 Voice)

### 1. `📜 01 — GATE OF SHADOWS` (6 Text)
- `👋・welcome` (read-only for members)
- `📜・rules` (read-only for members; hosts `✅` rules reaction gate)
- `📢・announcements` (`announcement`, read-only for members)
- `📌・important-info` (read-only for members)
- `🎭・choose-your-role` (read-only for members)
- `🎭・выбор-ролей` (read-only for members)

### 2. `🔥 02 — THE COMMON HALL` (5 Text)
- `💬・general-chat`
- `👤・introductions`
- `📸・screenshots`
- `😂・memes`
- `❓・help-and-questions`

### 3. `🌍 03 — LANGUAGE REALMS` (2 Text)
- `🇬🇧・english-chat` (`🇬🇧 English` + `✅ Verified`)
- `🇷🇺・русский-чат` (`🇷🇺 Русский` + `✅ Verified`)

### 4. `🎮 04 — GAME HUB` (6 Text)
- `🎮・game-discussion`
- `📖・guides-and-tips`
- `📈・game-progression`
- `🐉・boss-strategies`
- `⚔️・pvp-and-battles`
- `🔔・server-merge`

### 5. `🧙 05 — CLASS HALLS` (3 Text)
- `⚔️・warrior-hall` (`⚔️ Warrior` + `✅ Verified` + leadership visibility)
- `🔮・sorcerer-hall` (`🔮 Sorcerer` + `✅ Verified` + leadership visibility)
- `🗡️・swordsman-hall` (`🗡️ Swordsman` + `✅ Verified` + leadership visibility)

### 6. `🖤 06 — SHADOWSLAYERS` (6 Text)
- `🏰・clan-announcements` (`announcement`, read-only for ordinary clan members; aliased to `👑・clan-announcements`)
- `💬・clan-chat`
- `📋・clan-roster` (read-only for ordinary clan members)
- `🤝・recruitment`
- `⚔️・war-planning`
- `🎯・clan-goals`

### 7. `👑 07 — THE INNER SANCTUM` (4 Text — Leadership Only)
- `👑・leader-chat`
- `📊・clan-management`
- `📅・event-planning`
- `🛡️・moderation-log`

### 8. `🔊 08 — VOICE CHAMBERS` (4 Voice)
- `🔊 General Voice`
- `⚔️ PvP Squad`
- `🐉 Boss Hunting`
- `🌙 AFK`

### 9. `🏰 09 — CLAN VOICE` (1 Voice)
- `🏰 Clan Voice`

---

## 3. Five-Step Member Onboarding Flow

1. **Step 1 — Rules Acceptance:** New member sees `📜 01 — GATE OF SHADOWS` only; reacts with `✅` in `📜・rules` to receive `✅ Verified`. Removing `✅` revokes `✅ Verified` while preserving unrelated roles.
2. **Step 2 — Language Selection:** Member picks `🇬🇧 English` or `🇷🇺 Русский` (exclusive) in `🎭・choose-your-role` / `🎭・выбор-ролей`.
3. **Step 3 — Class Selection:** Member picks `⚔️ Warrior`, `🔮 Sorcerer`, or `🗡️ Swordsman` (exclusive).
4. **Step 4 — Notifications (Optional):** Member toggles `📢 Event Pings`, `🐉 Boss Pings`, `🏆 PvP Pings`.
5. **Step 5 — Active-Player Confirmation:** Only after Steps 1–3 are satisfied may the member trigger the active-player action (`onboarding:active_player` button or `/onboarding complete`) to earn `🌱 Recruit`. Higher existing clan ranks are never overwritten or demoted.
