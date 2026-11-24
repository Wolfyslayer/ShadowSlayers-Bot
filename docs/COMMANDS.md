# Slash Command Reference – ShadowSlayers – Legends of Elements

All commands enforce RBAC permission validation, localized responses, structured error handling, and audit logging. No AI commands exist.

## General & Diagnostics
- `/help` — Show categorized command directory
- `/about` — Display bot architecture, version, and realm summary
- `/bot-status` — Inspect Discord Gateway connection mode, tag, guild count, and database driver
- `/profile` — View member XP, level, clan rank, classes, and languages
- `/userinfo` — Inspect a member's clan rank, verification state, classes, and languages
- `/avatar` — View a member's avatar URL
- `/server` / `/serverinfo` — Show discovered server categories, roles, and member counts
- `/language` — Select or toggle personal enabled language roles
- `/modules` — View enabled/disabled server modules
- `/dashboard` — Retrieve direct link to the administration web dashboard

## Setup, Onboarding & Administration
- `/setup` — Ephemeral, initiator-locked server discovery preview (`Missing only`, two-step confirmed `Full setup`, `Cancel`, partial-failure retry)
- `/config` — Inspect or update core guild configuration values
- `/permissions` / `/permissions preview` / `/permissions matrix` — Run permission audit, preview 10-case access boundary matrix, or view capability table
- `/rules publish` — Publish the `📜・rules` verification message with `✅` reaction & active-player button
- `/onboarding` — Check 5-step onboarding status or complete Step 5 active-player `🌱 Recruit` confirmation

## Roles & Deterministic AutoMod
- `/roles` / `/roles list` — List role panels and self-assignable role groups
- `/roles publish` — Publish configured role-selection panels (strictly panel publishing; never runs server setup)
- `/automod status` — Inspect active deterministic AutoMod rules and lockdown state
- `/automod test` — Test sample message text against deterministic AutoMod rules
- `/false-positive` — Submit an AutoMod false-positive report for moderator review
- `/custom-response` — Add, list, or remove deterministic keyword/prefix/exact responses (Zero AI)

## Moderation
- `/warn` — Issue a formal warning with unique case ID
- `/warnings` — List active and historical warnings for a member
- `/timeout` — Timeout a member for a configured duration
- `/untimeout` — Remove an active timeout early
- `/kick` — Kick a member with logged case reason
- `/ban` — Permanently ban a member with case record
- `/tempban` — Temporarily ban a member and schedule automatic unban task
- `/unban` — Revoke a ban by user ID
- `/purge` — Bulk-delete messages with audit logging
- `/slowmode` — Configure channel slowmode seconds
- `/lock` — Lock channel messaging permissions
- `/unlock` — Restore channel messaging permissions
- `/modlog` — Query recent moderation cases
- `/case` — Inspect a single moderation case by ID
- `/appeal` — Submit a moderation appeal for staff review

## Community
- `/suggest` — Submit a community suggestion for voting
- `/poll` — Create a multi-option poll
- `/giveaway` — Launch a timed giveaway with scheduled winner draw
- `/event` — Schedule a community or raid event with RSVPs
- `/remind` — Schedule a persistent personal or channel reminder

## Recruitment
- `/recruitment` — View open recruitment categories
- `/apply` — Submit a clan, staff, or event application
- `/applications` — Review pending applications (staff)

## Support
- `/ticket` — Create, claim, transfer, close, or reopen a support ticket

## Clan
- `/clan` — Overview of ShadowSlayers hierarchy, teams, and upcoming raids
- `/members` — Search clan roster by rank, class, or language
- `/leaderboard` — Display XP & progression rankings
- `/achievements` — View unlocked and available clan achievements
- `/activity` — Inspect member activity and inactivity metrics
