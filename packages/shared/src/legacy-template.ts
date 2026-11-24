import type { ClanRankName, DiscoveredChannel, RoleCategory } from './types.ts';

export interface LegacyRoleSpec {
  key: string;
  name: string;
  aliases: string[];
  category: RoleCategory;
  rankOrder: number;
  colorHex: string;
  selfAssignable: boolean;
  exclusiveGroupId: string | null;
  mentionable: boolean;
  required: boolean;
}

export interface LegacyChannelSpec {
  key: string;
  categoryName: string;
  name: string;
  aliases: string[];
  type: DiscoveredChannel['type'];
  topic: string;
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

export const LEGACY_ROLE_SPECS: LegacyRoleSpec[] = [
  // Clan Hierarchy (Leadership-assigned only, never self-assignable)
  { key: 'rank_shadow_king', name: '👑 Shadow King', aliases: ['Shadow King', 'shadow king'], category: 'clan_rank', rankOrder: 600, colorHex: '#D97706', selfAssignable: false, exclusiveGroupId: 'clan_rank', mentionable: false, required: true },
  { key: 'rank_shadow_council', name: '🛡️ Shadow Council', aliases: ['Shadow Council', 'shadow council'], category: 'clan_rank', rankOrder: 500, colorHex: '#B45309', selfAssignable: false, exclusiveGroupId: 'clan_rank', mentionable: true, required: true },
  { key: 'rank_warlord', name: '⚔️ Warlord', aliases: ['Warlord', 'warlord'], category: 'clan_rank', rankOrder: 400, colorHex: '#DC2626', selfAssignable: false, exclusiveGroupId: 'clan_rank', mentionable: true, required: true },
  { key: 'rank_elite_warrior', name: '🔥 Elite Warrior', aliases: ['Elite Warrior', 'elite warrior'], category: 'clan_rank', rankOrder: 300, colorHex: '#0284C7', selfAssignable: false, exclusiveGroupId: 'clan_rank', mentionable: false, required: true },
  { key: 'rank_shadowslayer', name: '🖤 ShadowSlayer', aliases: ['ShadowSlayer', 'shadowslayer'], category: 'clan_rank', rankOrder: 200, colorHex: '#4F46E5', selfAssignable: false, exclusiveGroupId: 'clan_rank', mentionable: false, required: true },
  { key: 'rank_recruit', name: '🌱 Recruit', aliases: ['Recruit', 'recruit'], category: 'clan_rank', rankOrder: 100, colorHex: '#64748B', selfAssignable: false, exclusiveGroupId: 'clan_rank', mentionable: false, required: true },

  // Class Roles (Exclusive self-assignable group)
  { key: 'class_warrior', name: '⚔️ Warrior', aliases: ['Warrior', 'warrior'], category: 'class', rankOrder: 0, colorHex: '#DC2626', selfAssignable: true, exclusiveGroupId: 'class_exclusive', mentionable: false, required: true },
  { key: 'class_sorcerer', name: '🔮 Sorcerer', aliases: ['Sorcerer', 'sorcerer'], category: 'class', rankOrder: 0, colorHex: '#7C3AED', selfAssignable: true, exclusiveGroupId: 'class_exclusive', mentionable: false, required: true },
  { key: 'class_swordsman', name: '🗡️ Swordsman', aliases: ['Swordsman', 'swordsman'], category: 'class', rankOrder: 0, colorHex: '#0EA5E9', selfAssignable: true, exclusiveGroupId: 'class_exclusive', mentionable: false, required: true },

  // Notification Roles (Multi-select self-assignable group)
  { key: 'notify_event', name: '📢 Event Pings', aliases: ['Event Pings', 'event pings'], category: 'notification', rankOrder: 0, colorHex: '#F59E0B', selfAssignable: true, exclusiveGroupId: null, mentionable: true, required: true },
  { key: 'notify_boss', name: '🐉 Boss Pings', aliases: ['Boss Pings', 'boss pings'], category: 'notification', rankOrder: 0, colorHex: '#EA580C', selfAssignable: true, exclusiveGroupId: null, mentionable: true, required: true },
  { key: 'notify_pvp', name: '🏆 PvP Pings', aliases: ['PvP Pings', 'pvp pings'], category: 'notification', rankOrder: 0, colorHex: '#EAB308', selfAssignable: true, exclusiveGroupId: null, mentionable: true, required: true },

  // Language Roles (Exclusive group in legacy panel)
  { key: 'lang_en', name: '🇬🇧 English', aliases: ['English', 'english', 'EN'], category: 'language', rankOrder: 0, colorHex: '#0EA5E9', selfAssignable: true, exclusiveGroupId: 'language_exclusive', mentionable: false, required: true },
  { key: 'lang_ru', name: '🇷🇺 Русский', aliases: ['Русский', 'Russian', 'russian', 'RU'], category: 'language', rankOrder: 0, colorHex: '#10B981', selfAssignable: true, exclusiveGroupId: 'language_exclusive', mentionable: false, required: true },

  // System & Verification Roles
  { key: 'sys_bots', name: '🤖 Bots', aliases: ['Bots', 'bots'], category: 'system', rankOrder: 0, colorHex: '#475569', selfAssignable: false, exclusiveGroupId: null, mentionable: false, required: true },
  { key: 'sys_verified', name: '✅ Verified', aliases: ['Verified', 'verified'], category: 'verified', rankOrder: 0, colorHex: '#16A34A', selfAssignable: false, exclusiveGroupId: null, mentionable: false, required: true },
];

export const LEGACY_CATEGORY_SPECS: LegacyCategorySpec[] = [
  { key: 'cat_01_gate', name: '📜 01 — GATE OF SHADOWS', aliases: ['Gate of Shadows', '01 — GATE OF SHADOWS'], position: 1, isPrivateLeadership: false, required: true },
  { key: 'cat_02_common', name: '🔥 02 — THE COMMON HALL', aliases: ['Common Hall', 'THE COMMON HALL', '02 — THE COMMON HALL'], position: 2, isPrivateLeadership: false, required: true },
  { key: 'cat_03_languages', name: '🌍 03 — LANGUAGE REALMS', aliases: ['Language Realms', '03 — LANGUAGE REALMS'], position: 3, isPrivateLeadership: false, required: true },
  { key: 'cat_04_loe', name: '⚔️ 04 — LEGENDS OF ELEMENTS', aliases: ['Legends of Elements', '04 — LEGENDS OF ELEMENTS'], position: 4, isPrivateLeadership: false, required: true },
  { key: 'cat_05_class_halls', name: '🧙 05 — CLASS HALLS', aliases: ['Class Halls', '05 — CLASS HALLS'], position: 5, isPrivateLeadership: false, required: true },
  { key: 'cat_06_shadowslayers', name: '🖤 06 — SHADOWSLAYERS', aliases: ['ShadowSlayers', '06 — SHADOWSLAYERS'], position: 6, isPrivateLeadership: false, required: true },
  { key: 'cat_07_sanctum', name: '👑 07 — THE INNER SANCTUM', aliases: ['Inner Sanctum', 'THE INNER SANCTUM', '07 — THE INNER SANCTUM'], position: 7, isPrivateLeadership: true, required: true },
  { key: 'cat_08_voice', name: '🔊 08 — VOICE CHAMBERS', aliases: ['Voice Chambers', '08 — VOICE CHAMBERS'], position: 8, isPrivateLeadership: false, required: true },
  { key: 'cat_09_clan_voice', name: '🏰 09 — CLAN VOICE', aliases: ['Clan Voice', '09 — CLAN VOICE'], position: 9, isPrivateLeadership: false, required: true },
];

export const LEGACY_CHANNEL_SPECS: LegacyChannelSpec[] = [
  // 01 — GATE OF SHADOWS
  { key: 'ch_welcome', categoryName: '📜 01 — GATE OF SHADOWS', name: 'welcome', aliases: ['gate-welcome'], type: 'text', topic: 'Gate of Shadows arrival and server introduction.', accessClassification: 'public_onboarding', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_rules', categoryName: '📜 01 — GATE OF SHADOWS', name: 'rules', aliases: ['server-rules'], type: 'text', topic: 'Server covenant and verification acceptance.', accessClassification: 'public_onboarding', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_verify', categoryName: '📜 01 — GATE OF SHADOWS', name: 'verification', aliases: ['verify', 'gate-verification'], type: 'text', topic: 'Explicit rules acceptance and ✅ Verified role gate.', accessClassification: 'public_onboarding', languageCode: null, existingChannelId: null, required: true },

  // 02 — THE COMMON HALL
  { key: 'ch_announcements', categoryName: '🔥 02 — THE COMMON HALL', name: 'announcements', aliases: ['news'], type: 'announcement', topic: 'Server-wide updates and official decrees.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_common_chat', categoryName: '🔥 02 — THE COMMON HALL', name: 'common-hall', aliases: ['general', 'tavern'], type: 'text', topic: 'General community discussion for verified members.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_role_select', categoryName: '🔥 02 — THE COMMON HALL', name: 'role-selection', aliases: ['roles', 'self-roles'], type: 'text', topic: 'Language, Class, and Notification role selection panels.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_suggestions', categoryName: '🔥 02 — THE COMMON HALL', name: 'suggestions', aliases: [], type: 'text', topic: 'Community proposals and voting.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: false },

  // 03 — LANGUAGE REALMS
  { key: 'ch_en_general', categoryName: '🌍 03 — LANGUAGE REALMS', name: '🇬🇧・en-general', aliases: ['en-general', 'english-chat'], type: 'text', topic: 'English community realm.', accessClassification: 'verified_member', languageCode: 'en', existingChannelId: null, required: true },
  { key: 'ch_ru_general', categoryName: '🌍 03 — LANGUAGE REALMS', name: '🇷🇺・ru-general', aliases: ['ru-general', 'russian-chat'], type: 'text', topic: 'Русскоязычный зал сообщества.', accessClassification: 'verified_member', languageCode: 'ru', existingChannelId: null, required: true },

  // 04 — LEGENDS OF ELEMENTS
  { key: 'ch_loe_news', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: 'loe-updates', aliases: ['game-updates', 'loe-announcements'], type: 'announcement', topic: 'Legends of Elements game patches and boss schedules.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_loe_guides', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: 'elemental-guides', aliases: ['guides'], type: 'forum', topic: 'Builds, dungeons, and elemental synergy guides.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_loe_lfg', categoryName: '⚔️ 04 — LEGENDS OF ELEMENTS', name: 'dungeon-lfg', aliases: ['raid-planning', 'lfg'], type: 'text', topic: 'Party finder for dungeons, bosses, and PvP.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },

  // 05 — CLASS HALLS
  { key: 'ch_hall_warrior', categoryName: '🧙 05 — CLASS HALLS', name: '⚔️・warrior-hall', aliases: ['warrior-hall'], type: 'text', topic: 'Tactics and builds for ⚔️ Warrior players.', accessClassification: 'class_hall', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_hall_sorcerer', categoryName: '🧙 05 — CLASS HALLS', name: '🔮・sorcerer-hall', aliases: ['sorcerer-hall'], type: 'text', topic: 'Arcane builds and rotations for 🔮 Sorcerer players.', accessClassification: 'class_hall', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_hall_swordsman', categoryName: '🧙 05 — CLASS HALLS', name: '🗡️・swordsman-hall', aliases: ['swordsman-hall'], type: 'text', topic: 'Blade mastery and PvP strategies for 🗡️ Swordsman players.', accessClassification: 'class_hall', languageCode: null, existingChannelId: null, required: true },

  // 06 — SHADOWSLAYERS
  { key: 'ch_clan_hall', categoryName: '🖤 06 — SHADOWSLAYERS', name: 'clan-hall', aliases: ['clan-chat', 'shadowslayers-chat'], type: 'text', topic: 'Private hall for verified clan members.', accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_clan_roster', categoryName: '🖤 06 — SHADOWSLAYERS', name: 'clan-roster', aliases: ['roster'], type: 'text', topic: 'Active ShadowSlayers roster and squad assignments.', accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_clan_recruitment', categoryName: '🖤 06 — SHADOWSLAYERS', name: 'recruitment-desk', aliases: ['apply', 'recruitment'], type: 'text', topic: 'Clan and event recruitment intake.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },

  // 07 — THE INNER SANCTUM
  { key: 'ch_council_chamber', categoryName: '👑 07 — THE INNER SANCTUM', name: 'council-chamber', aliases: ['staff-chat', 'leadership'], type: 'text', topic: 'Leadership-only strategy and administration.', accessClassification: 'leadership_only', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_mod_logs', categoryName: '👑 07 — THE INNER SANCTUM', name: 'sanctum-mod-logs', aliases: ['mod-logs', 'modlog'], type: 'text', topic: 'Moderation cases and AutoMod alerts.', accessClassification: 'leadership_only', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_audit_logs', categoryName: '👑 07 — THE INNER SANCTUM', name: 'sanctum-audit-logs', aliases: ['audit-logs', 'server-logs'], type: 'text', topic: 'Centralized server & dashboard audit trail.', accessClassification: 'leadership_only', languageCode: null, existingChannelId: null, required: true },

  // 08 — VOICE CHAMBERS
  { key: 'ch_vc_citadel', categoryName: '🔊 08 — VOICE CHAMBERS', name: 'Citadel Hall VC', aliases: ['General VC', 'Lounge VC'], type: 'voice', topic: 'Open community voice lounge.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_vc_dungeon', categoryName: '🔊 08 — VOICE CHAMBERS', name: 'Dungeon Party VC', aliases: ['Party VC'], type: 'voice', topic: 'Co-op dungeon voice room.', accessClassification: 'verified_member', languageCode: null, existingChannelId: null, required: false },

  // 09 — CLAN VOICE
  { key: 'ch_vc_clan_raid', categoryName: '🏰 09 — CLAN VOICE', name: 'Clan Raid Command', aliases: ['Raid Command VC', 'War Room VC'], type: 'voice', topic: 'Clan-only raid coordination voice channel.', accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: true },
  { key: 'ch_vc_clan_pvp', categoryName: '🏰 09 — CLAN VOICE', name: 'Clan PvP Squad', aliases: ['PvP VC'], type: 'voice', topic: 'Clan-only PvP squad voice channel.', accessClassification: 'clan_member', languageCode: null, existingChannelId: null, required: false },
];

export const LEADERSHIP_CLAN_RANKS: ClanRankName[] = [
  '👑 Shadow King',
  '🛡️ Shadow Council',
  '⚔️ Warlord',
];

export const LEGACY_SERVER_TEMPLATE = {
  templateVersion: '0.1-legacy-compat',
  roles: LEGACY_ROLE_SPECS,
  categories: LEGACY_CATEGORY_SPECS,
  channels: LEGACY_CHANNEL_SPECS,
};
