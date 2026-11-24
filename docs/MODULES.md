# System Modules – ShadowSlayers – Legends of Elements

1. **Discovery & Setup Engine (`apps/bot/src/services/discovery.ts`, `apps/bot/src/commands/setup.ts`)** — Maps all 9 legacy categories (`📜 01 — GATE OF SHADOWS` through `🏰 09 — CLAN VOICE`), all 16 legacy roles (`👑 Shadow King` through `✅ Verified`), permission overwrites, and uncategorized channels via exact + controlled alias matching with conflict blocking and ephemeral initiator-locked `/setup` confirmation.
2. **Dynamic Multilingual Engine (`packages/localization/src/engine.ts`)** — Supports English (`en`), Russian (`ru`), and unlimited admin-created languages (e.g., Swedish `sv`) via templates, manual translation editing, completeness scoring, review approval, and non-destructive channel generation previews.
3. **Onboarding & Verification** — Isolates new members in `📜 01 — GATE OF SHADOWS` until explicit rules acceptance, grants `✅ Verified`, isolates `🧙 05 — CLASS HALLS` and `👑 07 — THE INNER SANCTUM`, and respects Discord native Membership Screening.
4. **Role Management** — Replaces Carl-bot with exclusive Language (`🇬🇧 English` / `🇷🇺 Русский`) & Class (`⚔️ Warrior` / `🔮 Sorcerer` / `🗡️ Swordsman`) panels, multi-select Notifications (`📢 Event Pings`, `🐉 Boss Pings`, `🏆 PvP Pings`), leadership-only Clan Rank blocking, temporary roles, and safe `/roles publish`.
5. **Moderation & Appeals** — Case-numbered actions (`/warn` through `/appeal`), hierarchy & bot-position enforcement, live Discord execution status (`verified_live` / `dry_run_no_bot` / `failed`), and persistent tempban expiration.
6. **Rule-Based AutoMod (`apps/bot/src/services/automod.ts`)** — Deterministic spam, repeat-message, mass-mention, phishing/invite link, blocked-word, raid-spike, and new-account filters with exemptions and emergency lockdown.
7. **Centralized Logging** — 17-category searchable audit trail with configurable Discord log channels and retention pruning.
8. **Member Progression (`apps/bot/src/services/xp.ts`)** — Anti-farming XP engine with cooldowns, duplicate suppression, levels, achievements, and leaderboards.
9. **Recruitment** — Multi-category configurable forms, submission queue, and reviewer-attributed approve/reject workflow.
10. **Tickets & Support** — Numbered private tickets, claim/transfer/close/reopen, transcripts, and feedback.
11. **Community Suite** — Suggestions, polls, giveaways, events, reminders, birthdays, challenges, inactivity reports, and scheduled announcements.
12. **Clan & Gaming Management** — Game-agnostic classes, teams/squads, raid & dungeon schedules, and attendance tracking.
13. **Persistent Scheduler (`apps/bot/src/services/scheduler.ts`)** — Crash-safe, idempotent background task runner surviving restarts without duplicate dispatch.
