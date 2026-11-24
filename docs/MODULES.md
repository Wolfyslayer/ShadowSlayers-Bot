# System Modules – ShadowSlayers – Legends of Elements

1. **Discovery Engine (`apps/bot/src/services/discovery.ts`)** — Maps existing categories (`Gate of Shadows`, `Common Hall`, `Language Realms`, `Legends of Elements`, `ShadowSlayers`, `Inner Sanctum`, `Voice Chambers`) and roles (`Shadow King` through `Bots`) without destructive edits.
2. **Dynamic Multilingual Engine (`packages/localization/src/engine.ts`)** — Supports English (`en`), Russian (`ru`), and unlimited admin-created languages (e.g., Swedish `sv`) via templates, manual translation editing, completeness scoring, review approval, and non-destructive channel generation previews.
3. **Onboarding & Verification** — Isolates new members until explicit rules acceptance, grants `✅ Verified`, separates clan ranks from multi-language roles, and protects `Inner Sanctum`.
4. **Role Management** — Replaces Carl-bot with button, select-menu, and reaction role panels, exclusive vs. multi-select groups, temporary roles, and safe `/roles publish`.
5. **Moderation & Appeals** — Case-numbered actions (`/warn` through `/appeal`), hierarchy enforcement, and persistent tempban expiration.
6. **Rule-Based AutoMod (`apps/bot/src/services/automod.ts`)** — Deterministic spam, repeat-message, mass-mention, phishing/invite link, blocked-word, raid-spike, and new-account filters with exemptions and emergency lockdown.
7. **Centralized Logging** — 17-category searchable audit trail with configurable Discord log channels and retention pruning.
8. **Member Progression (`apps/bot/src/services/xp.ts`)** — Anti-farming XP engine with cooldowns, duplicate suppression, levels, achievements, and leaderboards.
9. **Recruitment** — Multi-category configurable forms, submission queue, and reviewer-attributed approve/reject workflow.
10. **Tickets & Support** — Numbered private tickets, claim/transfer/close/reopen, transcripts, and feedback.
11. **Community Suite** — Suggestions, polls, giveaways, events, reminders, birthdays, challenges, inactivity reports, and scheduled announcements.
12. **Clan & Gaming Management** — Game-agnostic classes, teams/squads, raid & dungeon schedules, and attendance tracking.
13. **Persistent Scheduler (`apps/bot/src/services/scheduler.ts`)** — Crash-safe, idempotent background task runner surviving restarts without duplicate dispatch.
