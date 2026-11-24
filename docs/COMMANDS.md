# Slash Command Reference – ShadowSlayers Bot

All commands enforce RBAC permission validation, localized responses, structured error handling, and audit logging. No AI commands exist.

## Application Commands
- `npm run dev:bot` — Run the standalone bot from TypeScript (requires Discord configuration).
- `npm run build:bot` / `npm run start:bot` — Build and start the bot independently of Express/Vite.
- `npm run dev:dashboard`, `npm run build:dashboard`, `npm run preview:dashboard` — Dashboard development, static build, and local preview.
- `npm run dev:api`, `npm run build:api`, `npm run start:api` — Run/build the trusted API separately. It is not a Discord Gateway host; live Discord actions are sent to the bot through the shared Firestore command queue.
- `npm test`, `npm run lint`, `npm run security:check` — Offline tests, TypeScript check, and repository security checks.

## General & Diagnostics
- `/help [category?]` — Show categorized command directory (optional String filter)
- `/about` — Display bot architecture, version, and realm summary
- `/bot-status` — Inspect Discord Gateway connection mode, tag, guild count, and database driver
- `/profile [member?]` — View member XP, level, clan rank, classes, and languages (optional User option)
- `/userinfo [member?]` — Inspect a member's clan rank, verification state, classes, and languages (optional User option)
- `/avatar [member?]` — View a member's avatar URL (optional User option)
- `/server` / `/serverinfo` — Show discovered server categories, roles, and member counts
- `/language [code?]` — Select or toggle personal enabled language roles (String option)
- `/modules` — View enabled/disabled server modules
- `/dashboard` — Retrieve direct link to the administration web dashboard

## Setup, Onboarding & Administration
- `/setup [confirm?]` — Ephemeral, initiator-locked server discovery preview (Boolean option)
- `/config [module?] [enabled?]` — Inspect or toggle core guild module settings (String module, Boolean enabled)
- `/permissions matrix` — Inspect clan rank hierarchy and capability matrix
- `/permissions preview` — Run permission audit and preview 10-case access boundary matrix
- `/rules publish [channel?]` — Publish the `📜・rules` verification message with `✅` reaction gate (optional Channel option; requires live Discord Gateway)
- `/onboarding status [member?]` — Check 5-step onboarding status for yourself or target member
- `/onboarding active_player [member?]` — Claim Step 5 active-player `🌱 Recruit` rank (requires Steps 1–3 complete and live Discord Gateway)

## Roles & Deterministic AutoMod
- `/roles list` — List role panels and self-assignable role groups
- `/roles publish <panel_id>` — Publish configured role-selection panels to Discord (required String panel_id; strictly panel publishing; requires live Discord Gateway)
- `/automod status` — Inspect active deterministic AutoMod rules, lockdown state, and false-positive queue
- `/automod test <message> [channel?] [mentions?]` — Test sample message text against deterministic AutoMod rules (required String message, Channel, Integer mentions 0–50)
- `/false-positive <message_id> <reason> [channel?] [content?]` — Submit an AutoMod false-positive report for moderator review (required String message_id & reason)
- `/custom-response <action> [trigger?] [response?] [match_mode?]` — Add, list, or remove deterministic keyword/prefix/exact responses (required String action: `list`, `add`, `remove`; choices: `contains`, `exact`, `startsWith`; Zero AI)


## Moderation
- `/warn <member> <reason>` — Issue a formal warning with unique case ID (required User member, String reason)
- `/warnings <member>` — List active and historical warnings for a member (required User member)
- `/timeout <member> <duration> <reason>` — Timeout a member (required User member, Integer duration 1–40320 minutes, String reason)
- `/untimeout <member> [reason?]` — Remove an active timeout early (required User member, optional String reason)
- `/kick <member> <reason> [confirmed?]` — Kick a member with logged case reason (required User member, String reason, optional Boolean confirmed)
- `/ban <member> <reason> [delete_message_days?] [confirmed?]` — Permanently ban a member with case record (required User member, String reason, Integer delete_message_days 0–7, Boolean confirmed)
- `/tempban <member> <duration> <reason>` — Temporarily ban a member and schedule automatic unban task (required User member, Integer duration 1–525600 minutes, String reason)
- `/unban <user_id> <reason>` — Revoke a ban by user ID (required String user_id, String reason)
- `/purge <amount> [channel?] [confirmed?]` — Bulk-delete messages with audit logging (required Integer amount 1–100, optional Channel channel, Boolean confirmed)
- `/slowmode <seconds> [channel?]` — Configure channel slowmode seconds (required Integer seconds 0–21600, optional Channel channel)
- `/lock <channel> <reason>` — Lock channel messaging permissions (required Channel channel, String reason)
- `/unlock <channel> <reason>` — Restore channel messaging permissions (required Channel channel, String reason)
- `/modlog [limit?]` — Query recent moderation cases (optional Integer limit 1–25)
- `/case <case_id>` — Inspect a single moderation case by ID (required String case_id)
- `/appeal <case_id> <reason>` — Submit a moderation appeal for staff review (required String case_id, String reason)

## Community
- `/suggest <title> <description>` — Submit a community suggestion for voting (required String title, String description)
- `/poll <question> <options>` — Create a multi-option poll (required String question, String options: 2–6 comma-separated choices)
- `/giveaway <prize> <minutes>` — Launch a timed giveaway with scheduled winner draw (required String prize, Integer minutes 1–43200)
- `/event <title> [type?]` — Schedule a community or raid event with RSVPs (required String title, String type choices: `raid`, `dungeon`, `community`, `tournament`)
- `/remind <minutes> <message>` — Schedule a persistent personal or channel reminder (required Integer minutes 1–525600, String message)

## Recruitment
- `/recruitment` — View open recruitment categories
- `/apply <category> <summary>` — Submit a clan, staff, or event application (required String category: `clan`, `staff`; String summary)
- `/applications` — Review pending applications (staff)

## Support
- `/ticket <subject>` — Create a numbered support ticket (required String subject)

## Clan
- `/clan` — Overview of ShadowSlayers hierarchy, teams, and upcoming raids
- `/members [query?]` — Search clan roster by rank or username (optional String query)
- `/leaderboard` — Display XP & progression rankings
- `/achievements` — View unlocked and available clan achievements
- `/activity` — Inspect member activity and inactivity metrics

