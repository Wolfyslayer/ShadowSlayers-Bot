import type { ClanRankName, DiscoveredChannel, RoleCategory } from './types.ts';

export interface LegacyRoleSpec {
  key: string;
  name: string;
  aliases: string[];
  category: RoleCategory;
  rankOrder: number;
  colorHex: string | null; // Unknown unless verified from live Discord guild
  hoist: boolean | null;
  selfAssignable: boolean;
  exclusiveGroupId: string | null;
  mentionable: boolean;
  required: boolean;
  intendedPermissions: string[];
  excludeFromAutoSetup: boolean;
  requiresAdminReview: boolean;
  unknownLegacyProperties: string[];
}

export interface LegacyChannelSpec {
  key: string;
  categoryName: string;
  name: string;
  aliases: string[];
  type: DiscoveredChannel['type'];
  topic: string;
  readOnlyForMembers: boolean;
  accessClassification: DiscoveredChannel['accessClassification'];
  languageCode: string | null;
  existingChannelId: string | null;
  required: boolean;
}

export interface LegacyCategorySpec {
  key: string;
  name: string;
  aliases: string[];
  position: number;
  isPrivateLeadership: boolean;
  required: boolean;
}

/**
 * Canonical 16 Legacy Discord Roles per Phase 0.2 specification.
 * - Colors and hoist settings are NOT invented (`colorHex: null`, `hoist: null`, `requiresAdminReview: true`).
 * - Privileged Discord permissions are stored strictly in `intendedPermissions` for audit inspection
 *   and are NEVER automatically granted during additive role creation.
 * - `👑 Shadow King` is marked `excludeFromAutoSetup: true` so setup never creates it automatically.
 */
export const LEGACY_ROLE_SPECS: LegacyRoleSpec[] = [
  // 1-6: Clan hierarchy (independent of language/class/notifications; never self-assignable)
  {
    key: 'rank_shadow_king',
    name: '👑 Shadow King',
    aliases: ['Shadow King', 'shadow king'],
    category: 'clan_rank',
    rankOrder: 600,
    colorHex: null,
    hoist: null,
    selfAssignable: false,
    exclusiveGroupId: 'clan_rank',
    mentionable: false,
    required: true,
    intendedPermissions: ['Administrator'],
    excludeFromAutoSetup: true,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist', 'exact_position'],
  },
  {
    key: 'rank_shadow_council',
    name: '🛡️ Shadow Council',
    aliases: ['Shadow Council', 'shadow council'],
    category: 'clan_rank',
    rankOrder: 500,
    colorHex: null,
    hoist: null,
    selfAssignable: false,
    exclusiveGroupId: 'clan_rank',
    mentionable: true,
    required: true,
    intendedPermissions: ['ManageGuild', 'ManageChannels', 'ManageRoles', 'ViewAuditLog', 'ModerateMembers'],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist', 'exact_position'],
  },
  {
    key: 'rank_warlord',
    name: '⚔️ Warlord',
    aliases: ['Warlord', 'warlord'],
    category: 'clan_rank',
    rankOrder: 400,
    colorHex: null,
    hoist: null,
    selfAssignable: false,
    exclusiveGroupId: 'clan_rank',
    mentionable: true,
    required: true,
    intendedPermissions: ['ManageMessages', 'MuteMembers', 'DeafenMembers'],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist', 'exact_position'],
  },
  {
    key: 'rank_elite_warrior',
    name: '🔥 Elite Warrior',
    aliases: ['Elite Warrior', 'elite warrior'],
    category: 'clan_rank',
    rankOrder: 300,
    colorHex: null,
    hoist: null,
    selfAssignable: false,
    exclusiveGroupId: 'clan_rank',
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist', 'exact_position'],
  },
  {
    key: 'rank_shadowslayer',
    name: '🖤 ShadowSlayer',
    aliases: ['ShadowSlayer', 'shadowslayer'],
    category: 'clan_rank',
    rankOrder: 200,
    colorHex: null,
    hoist: null,
    selfAssignable: false,
    exclusiveGroupId: 'clan_rank',
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist', 'exact_position'],
  },
  {
    key: 'rank_recruit',
    name: '🌱 Recruit',
    aliases: ['Recruit', 'recruit'],
    category: 'clan_rank',
    rankOrder: 100,
    colorHex: null,
    hoist: null,
    selfAssignable: false, // Granted via Step 5 active-player action ONLY
    exclusiveGroupId: 'clan_rank',
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist', 'exact_position'],
  },

  // 7-9: Class roles (exclusive — max 1 active)
  {
    key: 'class_warrior',
    name: '⚔️ Warrior',
    aliases: ['Warrior', 'warrior'],
    category: 'class',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: true,
    exclusiveGroupId: 'class_exclusive',
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },
  {
    key: 'class_sorcerer',
    name: '🔮 Sorcerer',
    aliases: ['Sorcerer', 'sorcerer'],
    category: 'class',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: true,
    exclusiveGroupId: 'class_exclusive',
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },
  {
    key: 'class_swordsman',
    name: '🗡️ Swordsman',
    aliases: ['Swordsman', 'swordsman'],
    category: 'class',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: true,
    exclusiveGroupId: 'class_exclusive',
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },

  // 10-12: Notification roles (optional, multiple allowed)
  {
    key: 'notify_event',
    name: '📢 Event Pings',
    aliases: ['Event Pings', 'event pings'],
    category: 'notification',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: true,
    exclusiveGroupId: null,
    mentionable: true,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },
  {
    key: 'notify_boss',
    name: '🐉 Boss Pings',
    aliases: ['Boss Pings', 'boss pings'],
    category: 'notification',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: true,
    exclusiveGroupId: null,
    mentionable: true,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },
  {
    key: 'notify_pvp',
    name: '🏆 PvP Pings',
    aliases: ['PvP Pings', 'pvp pings'],
    category: 'notification',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: true,
    exclusiveGroupId: null,
    mentionable: true,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },

  // 13-14: Language roles (exclusive in original flow)
  {
    key: 'lang_en',
    name: '🇬🇧 English',
    aliases: ['English', 'english', 'EN'],
    category: 'language',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: true,
    exclusiveGroupId: 'language_exclusive',
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },
  {
    key: 'lang_ru',
    name: '🇷🇺 Русский',
    aliases: ['Русский', 'Russian', 'russian', 'RU'],
    category: 'language',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: true,
    exclusiveGroupId: 'language_exclusive',
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },

  // 15-16: System & Verification roles
  {
    key: 'sys_bots',
    name: '🤖 Bots',
    aliases: ['Bots', 'bots'],
    category: 'system',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: false,
    exclusiveGroupId: null,
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },
  {
    key: 'sys_verified',
    name: '✅ Verified',
    aliases: ['Verified', 'verified'],
    category: 'verified',
    rankOrder: 0,
    colorHex: null,
    hoist: null,
    selfAssignable: false, // Granted ONLY via 📜・rules ✅ reaction verification; never in public role panels
    exclusiveGroupId: null,
    mentionable: false,
    required: true,
    intendedPermissions: [],
    excludeFromAutoSetup: false,
    requiresAdminReview: true,
    unknownLegacyProperties: ['color', 'hoist'],
  },
];

/**
 * Canonical 9 Legacy Categories in exact order.
 */
export const LEGACY_CATEGORY_SPECS: LegacyCategorySpec[] = [
  { key: 'cat_01_gate', name: '📜 01 — GATE OF SHADOWS', aliases: ['01 — GATE OF SHADOWS', 'Gate of Shadows'], position: 1, isPrivateLeadership: false, required: true },
  { key: 'cat_02_common', name: '🔥 02 — THE COMMON HALL', aliases: ['02 — THE COMMON HALL', 'THE COMMON HALL'], position: 2, isPrivateLeadership: false, required: true },
  { key: 'cat_03_languages', name: '🌍 03 — LANGUAGE REALMS', aliases: ['03 — LANGUAGE REALMS', 'Language Realms'], position: 3, isPrivateLeadership: false, required: true },
  { key: 'cat_04_loe', name: '⚔️ 04 — LEGENDS OF ELEMENTS', aliases: ['04 — LEGENDS OF ELEMENTS', 'Legends of Elements'], position: 4, isPrivateLeadership: false, required: true },
  { key: 'cat_05_class_halls', name: '🧙 05 — CLASS HALLS', aliases: ['05 — CLASS HALLS', 'Class Halls'], position: 5, isPrivateLeadership: false, required: true },
  { key: 'cat_06_shadowslayers', name: '🖤 06 — SHADOWSLAYERS', aliases: ['06 — SHADOWSLAYERS', 'ShadowSlayers'], position: 6, isPrivateLeadership: false, required: true },
  { key: 'cat_07_sanctum', name: '👑 07 — THE INNER SANCTUM', aliases: ['07 — THE INNER SANCTUM', 'THE INNER SANCTUM'], position: 7, isPrivateLeadership: true, required: true },
  { key: 'cat_08_voice', name: '🔊 08 — VOICE CHAMBERS', aliases: ['08 — VOICE CHAMBERS', 'Voice Chambers'], position: 8, isPrivateLeadership: false, required: true },
  { key: 'cat_09_clan_voice', name: '🏰 09 — CLAN VOICE', aliases: ['09 — CLAN VOICE', 'Clan Voice'], position: 9, isPrivateLeadership: false, required: true },
];

/**
 * Canonical 32 Legacy Text Channels + 5 Legacy Voice Channels = 37 exact legacy channels.
 */
export const LEGACY_TEXT_CHANNEL_SPECS: LegacyChannelSpec[] = [
  // Category 1: 📜 01 — GATE OF SHADOWS (6)
  { key: 'ch_welcome', categoryName: '📜 01 — GATE OF SHADOWS', name: '👋・welcome', aliases: ['welcome'], type: 'text', topic: 'Gate of Shadows arrival and server introduction.', readOnlyForMembers: true, accessClassification: 'public_onboarding', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_rules', categoryName: '📜 01 — GATE OF SHADOWS', name: '📜・rules', aliases: ['rules'], type: 'text', topic: 'Server covenant and ✅ reaction verification.', readOnlyForMembers: true, accessClassification: 'public_onboarding', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_announcements', categoryName: '📜 01 — GATE OF SHADOWS', name: '📢・announcements', aliases: ['announcements'], type: 'text', topic: 'Server-wide updates and official decrees.', readOnlyForMembers: true, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_important_info', categoryName: '📜 01 — GATE OF SHADOWS', name: '📌・important-info', aliases: ['important-info'], type: 'text', topic: 'Key clan guidelines, server links, and permanent reference info.', readOnlyForMembers: true, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_choose_role_en', categoryName: '📜 01 — GATE OF SHADOWS', name: '🎭・choose-your-role', aliases: ['choose-your-role'], type: 'text', topic: 'English role-selection panel: Language, Class, Notifications, and Active-Player Recruit.', readOnlyForMembers: true, accessClassification: 'verified_member', languageCode: 'en', existingChannelId: null, required: true },
  { key: 'ch_choose_role_ru', categoryName: '📜 01 — GATE OF SHADOWS', name: '🎭・выбор-ролей', aliases: ['выбор-ролей'], type: 'text', topic: 'Панель выбора ролей: язык, класс, уведомления и вход в клан.', readOnlyForMembers: true, accessClassification: 'verified_member', languageCode: 'ru', existingChannelId: null, required: true },

  // Category 2: 🔥 02 — THE COMMON HALL (5)
  { key: 'ch_general_chat', categoryName: '🔥 02 — THE COMMON HALL', name: '💬・general-chat', aliases: ['general-chat'], type: 'text', topic: 'General community discussion for verified members.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_introductions', categoryName: '🔥 02 — THE COMMON HALL', name: '👤・introductions', aliases: ['introductions'], type: 'text', topic: 'Introduce yourself to the ShadowSlayers community.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_screenshots', categoryName: '🔥 02 — THE COMMON HALL', name: '📸・screenshots', aliases: ['screenshots'], type: 'text', topic: 'Share in-game moments, drops, and victories.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_memes', categoryName: '🔥 02 — THE COMMON HALL', name: '😂・memes', aliases: ['memes'], type: 'text', topic: 'Community memes and light humor.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_help_questions', categoryName: '🔥 02 — THE COMMON HALL', name: '❓・help-and-questions', aliases: ['help-and-questions'], type: 'text', topic: 'Ask community questions and request gameplay help.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },

  // Category 3: 🌍 03 — LANGUAGE REALMS (2)
  { key: 'ch_english_chat', categoryName: '🌍 03 — LANGUAGE REALMS', name: '🇬🇧・english-chat', aliases: ['english-chat'], type: 'text', topic: 'English community realm.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: 'en', existingChannelId: null, required: true },
  { key: 'ch_russian_chat', categoryName: '🌍 03 — LANGUAGE REALMS', name: '🇷🇺・русский-чат', aliases: ['русский-чат'], type: 'text', topic: 'Русскоязычный зал сообщества.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: 'ru', existingChannelId: null, required: true },

  // Category 4: ⚔️ 04 — LEGENDS OF ELEMENTS (6)
  { key: 'ch_game_discussion', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: '🎮・game-discussion', aliases: ['game-discussion'], type: 'text', topic: 'Legends of Elements general game discussion.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_guides_tips', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: '📖・guides-and-tips', aliases: ['guides-and-tips'], type: 'text', topic: 'Community gameplay guides and elemental tips.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_game_progression', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: '📈・game-progression', aliases: ['game-progression'], type: 'text', topic: 'Gear upgrades, power milestones, and progression advice.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_boss_strategies', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: '🐉・boss-strategies', aliases: ['boss-strategies'], type: 'text', topic: 'World boss mechanics and raid strategies.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_pvp_battles', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: '⚔️・pvp-and-battles', aliases: ['pvp-and-battles'], type: 'text', topic: 'PvP builds, arena matchups, and battle coordination.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_server_merge', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: '🔔・server-merge', aliases: ['server-merge'], type: 'text', topic: 'Server merge coordination and realm updates.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },

  // Category 5: 🧙 05 — CLASS HALLS (3)
  { key: 'ch_hall_warrior', categoryName: '🧙 05 — CLASS HALLS', name: '⚔️・warrior-hall', aliases: ['warrior-hall'], type: 'text', topic: 'Tactics and builds for ⚔️ Warrior players.', readOnlyForMembers: false, accessClassification: 'class_hall', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_hall_sorcerer', categoryName: '🧙 05 — CLASS HALLS', name: '🔮・sorcerer-hall', aliases: ['sorcerer-hall'], type: 'text', topic: 'Arcane builds and rotations for 🔮 Sorcerer players.', readOnlyForMembers: false, accessClassification: 'class_hall', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_hall_swordsman', categoryName: '🧙 05 — CLASS HALLS', name: '🗡️・swordsman-hall', aliases: ['swordsman-hall'], type: 'text', topic: 'Blade mastery and PvP strategies for 🗡️ Swordsman players.', readOnlyForMembers: false, accessClassification: 'class_hall', languageCode: null, existingChannelId: null, required: true },

  // Category 6: 🖤 06 — SHADOWSLAYERS (6)
  { key: 'ch_clan_announcements', categoryName: '🖤 06 — SHADOWSLAYERS', name: '🏰・clan-announcements', aliases: ['👑・clan-announcements', 'clan-announcements'], type: 'text', topic: 'Official ShadowSlayers clan announcements (read-only for ordinary members).', readOnlyForMembers: true, accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_clan_chat', categoryName: '🖤 06 — SHADOWSLAYERS', name: '💬・clan-chat', aliases: ['clan-chat'], type: 'text', topic: 'Private hall chat for verified clan members.', readOnlyForMembers: false, accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_clan_roster', categoryName: '🖤 06 — SHADOWSLAYERS', name: '📋・clan-roster', aliases: ['clan-roster'], type: 'text', topic: 'ShadowSlayers clan roster and rank standings (read-only for ordinary members).', readOnlyForMembers: true, accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_recruitment', categoryName: '🖤 06 — SHADOWSLAYERS', name: '🤝・recruitment', aliases: ['recruitment'], type: 'text', topic: 'Clan recruitment and trial onboarding coordination.', readOnlyForMembers: false, accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_war_planning', categoryName: '🖤 06 — SHADOWSLAYERS', name: '⚔️・war-planning', aliases: ['war-planning'], type: 'text', topic: 'Clan war strategies, squads, and battle schedules.', readOnlyForMembers: false, accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_clan_goals', categoryName: '🖤 06 — SHADOWSLAYERS', name: '🎯・clan-goals', aliases: ['clan-goals'], type: 'text', topic: 'Seasonal clan targets and progression milestones.', readOnlyForMembers: false, accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },

  // Category 7: 👑 07 — THE INNER SANCTUM (4)
  { key: 'ch_leader_chat', categoryName: '👑 07 — THE INNER SANCTUM', name: '👑・leader-chat', aliases: ['leader-chat'], type: 'text', topic: 'Private leadership-only strategy and coordination.', readOnlyForMembers: false, accessClassification: 'leadership_only', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_clan_management', categoryName: '👑 07 — THE INNER SANCTUM', name: '📊・clan-management', aliases: ['clan-management'], type: 'text', topic: 'Leadership clan rank, roster, and operations management.', readOnlyForMembers: false, accessClassification: 'leadership_only', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_event_planning', categoryName: '👑 07 — THE INNER SANCTUM', name: '📅・event-planning', aliases: ['event-planning'], type: 'text', topic: 'Leadership scheduling for raids, PvP, and community events.', readOnlyForMembers: false, accessClassification: 'leadership_only', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_moderation_log', categoryName: '👑 07 — THE INNER SANCTUM', name: '🛡️・moderation-log', aliases: ['moderation-log', 'mod-log'], type: 'text', topic: 'Moderation cases, AutoMod alerts, and permission audits.', readOnlyForMembers: true, accessClassification: 'leadership_only', languageCode: null, existingChannelId: null, required: true },
];

/**
 * Canonical 5 Legacy Voice Channels.
 */
export const LEGACY_VOICE_CHANNEL_SPECS: LegacyChannelSpec[] = [
  // Category 8: 🔊 08 — VOICE CHAMBERS (4)
  { key: 'ch_vc_general', categoryName: '🔊 08 — VOICE CHAMBERS', name: '🔊 General Voice', aliases: ['General Voice'], type: 'voice', topic: 'Open verified community voice lounge.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_vc_pvp', categoryName: '🔊 08 — VOICE CHAMBERS', name: '⚔️ PvP Squad', aliases: ['PvP Squad'], type: 'voice', topic: 'Verified PvP squad voice channel.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_vc_boss', categoryName: '🔊 08 — VOICE CHAMBERS', name: '🐉 Boss Hunting', aliases: ['Boss Hunting'], type: 'voice', topic: 'Verified world boss hunting voice channel.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_vc_afk', categoryName: '🔊 08 — VOICE CHAMBERS', name: '🌙 AFK', aliases: ['AFK'], type: 'voice', topic: 'AFK voice chamber.', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },

  // Category 9: 🏰 09 — CLAN VOICE (1)
  { key: 'ch_vc_clan', categoryName: '🏰 09 — CLAN VOICE', name: '🏰 Clan Voice', aliases: ['Clan Voice'], type: 'voice', topic: 'Private clan voice channel for verified clan ranks.', readOnlyForMembers: false, accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
];

export const LEGACY_CHANNEL_SPECS: LegacyChannelSpec[] = [
  ...LEGACY_TEXT_CHANNEL_SPECS,
  ...LEGACY_VOICE_CHANNEL_SPECS,
];

/**
 * Optional New Platform Extension Channels — strictly separated from canonical legacy channels.
 * Never auto-added by `missing_only` legacy setup.
 */
export const OPTIONAL_EXTENSION_CHANNELS: LegacyChannelSpec[] = [
  { key: 'ext_audit_logs', categoryName: '👑 07 — THE INNER SANCTUM', name: '📜・audit-logs', aliases: ['sanctum-audit-logs', 'audit-logs'], type: 'text', topic: 'Optional extended dashboard & event audit trail (new platform feature).', readOnlyForMembers: true, accessClassification: 'leadership_only', languageCode: null, existingChannelId: null, required: false },
  { key: 'ext_suggestions', categoryName: '🔥 02 — THE COMMON HALL', name: '💡・suggestions', aliases: ['suggestions'], type: 'text', topic: 'Optional community suggestion intake (new platform feature).', readOnlyForMembers: false, accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: false },
];

export const LEADERSHIP_CLAN_RANKS: ClanRankName[] = [
  '👑 Shadow King',
  '🛡️ Shadow Council',
  '⚔️ Warlord',
];

export const LEGACY_SERVER_TEMPLATE = {
  templateVersion: '0.2-legacy-canonical',
  roles: LEGACY_ROLE_SPECS,
  categories: LEGACY_CATEGORY_SPECS,
  textChannels: LEGACY_TEXT_CHANNEL_SPECS,
  voiceChannels: LEGACY_VOICE_CHANNEL_SPECS,
  channels: LEGACY_CHANNEL_SPECS,
  optionalExtensions: OPTIONAL_EXTENSION_CHANNELS,
};
