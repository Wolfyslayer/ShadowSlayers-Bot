# Dashboard action and API contract

Guild routes below are relative to `/api/guild/:guildId`. They verify Discord access and the listed capability before any guild mutation. Feature routes also check the guild's module flag. Firestore is the persistent store. Gateway operations use the signed bot-control queue.

| Dashboard action | Method and route | Capability | Persistent and Discord effects |
| --- | --- | --- | --- |
| Load guild view | GET `/state` | overview.view | Reads guild, translations, bot state and command metadata |
| Rescan / apply setup | POST `/discovery/rescan`, `/discovery/confirm` | discovery.view / discovery.apply | Saves live discovery; apply creates verified Discord resources and reports partial failures |
| Add language, edit translations, toggle | POST `/languages`, PATCH `/languages/:code/translations`, POST `/languages/:code/toggle` | languages.manage | Saves language configuration; toggle does not remove existing Discord resources |
| Review language / create channels | POST `/languages/:code/review`, `/languages/:code/create-channels` | languages.approve | Saves review; channel creation uses live bot and stores returned IDs |
| Edit member | PATCH `/members/:userId` | members.edit | Saves language codes; clan rank changes require verified Discord role changes |
| Create / publish role panel | POST `/role-panels`, `/role-panels/:panelId/publish` | roles.publish | Saves panel; publication posts through the bot |
| Publish rules | POST `/rules/publish` | roles.publish | Posts rules and records message ID; onboarding module required |
| Verify rules / active-player confirmation | POST `/onboarding/:userId/verify-rules`, `/onboarding/:userId/active-player` | members.edit | Saves onboarding progress after required role jobs |
| Moderate / review appeal | POST `/moderation`, `/appeals/:appealId/review` | moderation.execute | Moderation uses a live job, records status, and returns an error on Discord failure. Appeal review saves its status |
| Save / test AutoMod | PUT `/automod`, POST `/automod/test` | automod.manage | Configuration write / deterministic non-mutating simulation |
| Report / resolve false positive | POST `/automod/false-positives`, PATCH `/automod/false-positives/:id` | overview.view / automod.manage | Writes report or review status |
| Save log routing | PUT `/logging/config` | logging.manage | Stores routing configuration |
| Create ticket / reply / change status | POST `/tickets`, `/tickets/:ticketId/messages`, `/tickets/:ticketId/action` | tickets.view / tickets.view / tickets.manage | Dashboard records, replies and lifecycle only |
| Apply / review recruitment | POST `/recruitment/apply`, `/recruitment/:appId/review` | overview.view / recruitment.review | Stores application and review status |
| Create or vote on suggestion | POST `/community/suggestions`, `/community/suggestions/:id/vote` | overview.view | Writes suggestion or vote record |
| Create or vote on poll | POST `/community/polls`, `/community/polls/:id/vote` | community.manage / overview.view | Writes poll or vote record |
| Create giveaway | POST `/community/giveaways` | community.manage | Stores the giveaway and schedules a draw. Creation does not post a Discord message |
| Schedule Discord announcement (unavailable) | Legacy POST `/community/announcements` | community.manage | Returns 501 without writing. Existing records are marked delivery unverified in the dashboard |
| Create or edit game, create team or raid | POST `/clan/games`, PATCH `/clan/games/:gameId`, POST `/clan/teams`, `/clan/raids` | clan.manage | Stores game, team or raid records |
| Run command | POST `/commands/execute` | overview.view plus bot command capability | Signed queue dispatch; result depends on command and module |
| Toggle modules / download backup | PATCH `/settings`, GET `/backup` | settings.manage | Writes module flags / exports a guild snapshot |

Session actions use Discord OAuth and `/api/auth/guilds`. The privacy view uses a purpose-specific OAuth token and the self-deletion endpoint. Navigation, search, filtering and locale selection are local UI actions. The automatic scheduler belongs to the bot, and the dashboard no longer offers a manual tick.

The table describes code paths and does not certify live Discord behavior. Phase 1.5 owns live acceptance. Before updating the bot, deploy the matching API so shared role jobs include their signed source module.
