/**
 * Immutable canonical server fixture for ShadowSlayers.
 * Used as an independent regression anchor in automated unit & mocked Discord API tests.
 * (Not a live Discord server test.)
 */

function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const val of Object.values(obj as Record<string, unknown>)) {
      if (val && typeof val === 'object' && !Object.isFrozen(val)) {
        deepFreeze(val);
      }
    }
  }
  return obj;
}

export const CANONICAL_LEGACY_FIXTURE = deepFreeze({
  roles: {
    clanHierarchy: [
      '👑 Shadow King',
      '🛡️ Shadow Council',
      '⚔️ Warlord',
      '🔥 Elite Warrior',
      '🖤 ShadowSlayer',
      '🌱 Recruit',
    ],
    classes: ['⚔️ Warrior', '🔮 Sorcerer', '🗡️ Swordsman'],
    notifications: ['📢 Event Pings', '🐉 Boss Pings', '🏆 PvP Pings'],
    languages: ['🇬🇧 English', '🇷🇺 Русский'],
    systemAndVerification: ['🤖 Bots', '✅ Verified'],
    all16: [
      '👑 Shadow King',
      '🛡️ Shadow Council',
      '⚔️ Warlord',
      '🔥 Elite Warrior',
      '🖤 ShadowSlayer',
      '🌱 Recruit',
      '⚔️ Warrior',
      '🔮 Sorcerer',
      '🗡️ Swordsman',
      '📢 Event Pings',
      '🐉 Boss Pings',
      '🏆 PvP Pings',
      '🇬🇧 English',
      '🇷🇺 Русский',
      '🤖 Bots',
      '✅ Verified',
    ],
  },
  categories9: [
    '📜 01 — GATE OF SHADOWS',
    '🔥 02 — THE COMMON HALL',
    '🌍 03 — LANGUAGE REALMS',
    '🎮 04 — GAME HUB',
    '🧙 05 — CLASS HALLS',
    '🖤 06 — SHADOWSLAYERS',
    '👑 07 — THE INNER SANCTUM',
    '🔊 08 — VOICE CHAMBERS',
    '🏰 09 — CLAN VOICE',
  ],
  textChannelsByCategory: {
    '📜 01 — GATE OF SHADOWS': [
      '👋・welcome',
      '📜・rules',
      '📢・announcements',
      '📌・important-info',
      '🎭・choose-your-role',
      '🎭・выбор-ролей',
    ],
    '🔥 02 — THE COMMON HALL': [
      '💬・general-chat',
      '👤・introductions',
      '📸・screenshots',
      '😂・memes',
      '❓・help-and-questions',
    ],
    '🌍 03 — LANGUAGE REALMS': [
      '🇬🇧・english-chat',
      '🇷🇺・русский-чат',
    ],
    '🎮 04 — GAME HUB': [
      '🎮・game-discussion',
      '📖・guides-and-tips',
      '📈・game-progression',
      '🐉・boss-strategies',
      '⚔️・pvp-and-battles',
      '🔔・server-merge',
    ],
    '🧙 05 — CLASS HALLS': [
      '⚔️・warrior-hall',
      '🔮・sorcerer-hall',
      '🗡️・swordsman-hall',
    ],
    '🖤 06 — SHADOWSLAYERS': [
      '🏰・clan-announcements',
      '💬・clan-chat',
      '📋・clan-roster',
      '🤝・recruitment',
      '⚔️・war-planning',
      '🎯・clan-goals',
    ],
    '👑 07 — THE INNER SANCTUM': [
      '👑・leader-chat',
      '📊・clan-management',
      '📅・event-planning',
      '🛡️・moderation-log',
    ],
  },
  voiceChannelsByCategory: {
    '🔊 08 — VOICE CHAMBERS': [
      '🔊 General Voice',
      '⚔️ PvP Squad',
      '🐉 Boss Hunting',
      '🌙 AFK',
    ],
    '🏰 09 — CLAN VOICE': [
      '🏰 Clan Voice',
    ],
  },
  readOnlyMemberChannels: [
    '👋・welcome',
    '📜・rules',
    '📢・announcements',
    '📌・important-info',
    '🎭・choose-your-role',
    '🎭・выбор-ролей',
    '🏰・clan-announcements',
    '📋・clan-roster',
  ],
});
