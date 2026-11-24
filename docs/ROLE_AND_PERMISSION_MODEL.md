# Role & Permission Model — ShadowSlayers

Defined in `packages/shared/src/legacy-template.ts` and enforced in `packages/permissions/src/hierarchy.ts`.

---

## 1. Role Groups & Mutual Independence

| Group | Roles | Selection Rule | Moderation Authority |
| :--- | :--- | :--- | :--- |
| **Clan Hierarchy** | `👑 Shadow King`, `🛡️ Shadow Council`, `⚔️ Warlord`, `🔥 Elite Warrior`, `🖤 ShadowSlayer`, `🌱 Recruit` | Leadership-assigned only (`🌱 Recruit` via Step 5 active-player action) | `👑 Shadow King` / `🛡️ Shadow Council` / `⚔️ Warlord` hold leadership capabilities |
| **Language** | `🇬🇧 English`, `🇷🇺 Русский` (plus approved dynamic realms) | Exclusive (1 active in public panel) | None |
| **Class** | `⚔️ Warrior`, `🔮 Sorcerer`, `🗡️ Swordsman` | Exclusive (1 active in public panel) | None |
| **Notification** | `📢 Event Pings`, `🐉 Boss Pings`, `🏆 PvP Pings` | Multi-select optional | None |
| **System / Verification** | `🤖 Bots`, `✅ Verified` | Never publicly self-assignable (`✅ Verified` via `📜・rules` `✅` reaction) | Bot / Verification gate only |

---

## 2. Discord OR-Combination Access Matrix

Because Discord resolves `Allow ViewChannel` by logical **OR** across all roles held by a member, category `@everyone ViewChannel = Deny` is mandatory on categories `02` through `09`:

| Member Combination | Gate (`01`) | Common Hall (`02`) / LoE (`04`) / Voice (`08`) | Language Realms (`03`) | Class Hall (`05`) | ShadowSlayers (`06`) / Clan Voice (`09`) | Inner Sanctum (`07`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Unverified + `⚔️ Warrior` | View (RO) | Denied | Denied | Denied | Denied | Denied |
| Unverified + `🌱 Recruit` | View (RO) | Denied | Denied | Denied | Denied | Denied |
| `✅ Verified` + `🇬🇧 English` | View (RO) | View & Send | `🇬🇧・english-chat` only | Denied | Denied | Denied |
| `✅ Verified` + Notification Pings | View (RO) | View & Send | Denied | Denied | Denied | Denied |
| `✅ Verified` + `🌱 Recruit` + `⚔️ Warrior` | View (RO) | View & Send | By language role | `⚔️・warrior-hall` only | View & Send (`🏰・clan-announcements` & `📋・clan-roster` RO) | Denied |
| `✅ Verified` + `🖤 ShadowSlayer` + `🇬🇧 English` | View (RO) | View & Send | `🇬🇧・english-chat` | By class role | View & Send (RO on `🏰・clan-announcements` & `📋・clan-roster`) | Denied |
| `✅ Verified` + `🔥 Elite Warrior` + `⚔️ Warrior` | View (RO) | View & Send | By language role | `⚔️・warrior-hall` only | View & Send (RO on `🏰・clan-announcements` & `📋・clan-roster`) | Denied |
| `✅ Verified` + `⚔️ Warlord` + `⚔️ Warrior` | View (RO) | View & Send | By language role | `⚔️・warrior-hall` | View & Send (can post in `🏰・clan-announcements`) | View & Send |
| `✅ Verified` + `🛡️ Shadow Council` | View (RO) | View & Send | By language role | Leadership view | View & Send | View & Send |
| `✅ Verified` + `👑 Shadow King` | View (RO) | View & Send | By language role | Leadership view | View & Send | View & Send |

Read-only channels for ordinary members: `👋・welcome`, `📜・rules`, `📢・announcements`, `📌・important-info`, `🎭・choose-your-role`, `🎭・выбор-ролей`, `🏰・clan-announcements`, `📋・clan-roster`.
