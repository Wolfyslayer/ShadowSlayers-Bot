# Slash Command Reference – ShadowSlayers – Legends of Elements

All commands enforce RBAC permission validation, localized responses, structured error handling, and audit logging. No AI commands exist.

## General
- `/help` — Show categorized command directory
- `/about` — Display bot architecture, version, and realm summary
- `/profile` — View member XP, level, clan rank, classes, and languages
- `/server` — Show discovered server categories, roles, and member counts
- `/language` — Select or toggle personal enabled language roles
- `/modules` — View enabled/disabled server modules
- `/dashboard` — Retrieve direct link to the administration web dashboard

## Setup & Administration
- `/setup` — Discover existing server structure and preview non-destructive setup diff
- `/config` — Inspect or update core guild configuration values
- `/permissions` — View role hierarchy and permission capability matrix

## Roles
- `/roles` — List role panels and self-assignable role groups
- `/roles publish` — Publish configured role-selection panels (strictly panel publishing; never runs server setup)

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
