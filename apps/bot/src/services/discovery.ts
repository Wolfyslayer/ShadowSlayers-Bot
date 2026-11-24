import type { Guild } from 'discord.js';
import type {
  DiscoveredCategory,
  GuildRoleRecord,
  ProposedSetupChange,
  ServerDiscoverySnapshot,
} from '../../../../packages/shared/src/types.ts';
import { CLAN_RANK_ORDER, type ClanRankName } from '../../../../packages/shared/src/types.ts';

export const EXPECTED_CATEGORIES = [
  'Gate of Shadows',
  'Common Hall',
  'Language Realms',
  'Legends of Elements',
  'ShadowSlayers',
  'Inner Sanctum',
  'Voice Chambers',
];

export const EXPECTED_BASE_ROLES = [
  'Shadow King',
  'Shadow Council',
  'Warlord',
  'Elite Warrior',
  'ShadowSlayer',
  'Recruit',
  'English',
  'Русский',
  'Bots',
];

function classifyRole(name: string): { category: GuildRoleRecord['category']; rankOrder: number } {
  const rankIdx = CLAN_RANK_ORDER.indexOf(name as ClanRankName);
  if (rankIdx !== -1) {
    return { category: 'clan_rank', rankOrder: (CLAN_RANK_ORDER.length - rankIdx) * 100 };
  }
  if (name === 'English' || name === 'Русский') {
    return { category: 'language', rankOrder: 0 };
  }
  if (name === 'Bots') {
    return { category: 'system', rankOrder: 0 };
  }
  if (name.includes('Verified')) {
    return { category: 'verified', rankOrder: 0 };
  }
  return { category: 'notification', rankOrder: 0 };
}

/**
 * Discovers an existing Discord Guild non-destructively.
 * Never deletes roles, never renames roles, and never overwrites permissions.
 */
export function discoverLiveDiscordGuild(
  discordGuild: Guild,
  existingSnapshot: ServerDiscoverySnapshot,
): ServerDiscoverySnapshot {
  const now = new Date().toISOString();
  const categories: DiscoveredCategory[] = [];
  const channelsByCategory = new Map<string, DiscoveredCategory>();

  const sortedCategories = [...discordGuild.channels.cache.values()]
    .filter((c) => c.type === 4) // GuildCategory
    .sort((a, b) => a.rawPosition - b.rawPosition);

  for (const cat of sortedCategories) {
    const isLeadership = cat.name.toLowerCase().includes('sanctum');
    const mapped: DiscoveredCategory = {
      id: `cat-${cat.id}`,
      discordCategoryId: cat.id,
      name: cat.name,
      position: cat.rawPosition,
      isPrivateLeadership: isLeadership,
      discoveredFromExisting: true,
      channels: [],
    };
    categories.push(mapped);
    channelsByCategory.set(cat.id, mapped);
  }

  for (const ch of discordGuild.channels.cache.values()) {
    if (ch.type === 4 || !ch.parentId) continue;
    const parent = channelsByCategory.get(ch.parentId);
    if (!parent) continue;
    parent.channels.push({
      id: `ch-${ch.id}`,
      discordChannelId: ch.id,
      name: ch.name,
      type: ch.isVoiceBased() ? 'voice' : ch.type === 5 ? 'announcement' : ch.type === 15 ? 'forum' : 'text',
      categoryId: parent.id,
      isPrivateLeadership: parent.isPrivateLeadership,
      languageCode: null,
      mappedRolePurpose: null,
      discoveredFromExisting: true,
    });
  }

  const roles: GuildRoleRecord[] = [...discordGuild.roles.cache.values()]
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map((r) => {
      const info = classifyRole(r.name);
      return {
        id: `role-${r.id}`,
        discordRoleId: r.id,
        name: r.name,
        category: info.category,
        rankOrder: info.rankOrder,
        colorHex: r.hexColor || '#64748B',
        selfAssignable: info.category === 'language' || info.category === 'class' || info.category === 'notification',
        exclusiveGroupId: info.category === 'clan_rank' ? 'clan_rank' : null,
        discoveredFromExisting: true,
        mapped: EXPECTED_BASE_ROLES.includes(r.name),
        mentionable: r.mentionable,
      };
    });

  const proposedChanges = computeNonDestructiveDiff(categories, roles);

  return {
    guildId: existingSnapshot.guildId,
    guildName: discordGuild.name,
    lastDiscoveredAt: now,
    categories,
    roles,
    proposedChanges,
    setupConfirmedBy: existingSnapshot.setupConfirmedBy,
    setupConfirmedAt: existingSnapshot.setupConfirmedAt,
  };
}

export function computeNonDestructiveDiff(
  categories: DiscoveredCategory[],
  roles: GuildRoleRecord[],
): ProposedSetupChange[] {
  const changes: ProposedSetupChange[] = [];
  const catNames = new Set(categories.map((c) => c.name.toLowerCase()));
  const roleNames = new Set(roles.map((r) => r.name.toLowerCase()));

  for (const expectedCat of EXPECTED_CATEGORIES) {
    if (catNames.has(expectedCat.toLowerCase())) {
      changes.push({
        id: `map-cat-${expectedCat.toLowerCase().replace(/\s+/g, '-')}`,
        kind: 'map_existing_category',
        targetName: expectedCat,
        reason: 'Existing category discovered and mapped cleanly without modifying structure.',
        nonDestructive: true,
        applied: true,
      });
    } else {
      changes.push({
        id: `create-cat-${expectedCat.toLowerCase().replace(/\s+/g, '-')}`,
        kind: 'create_channel',
        targetName: expectedCat,
        reason: 'Missing expected category; requires administrator confirmation to create additively.',
        nonDestructive: true,
        applied: false,
      });
    }
  }

  for (const expectedRole of [...EXPECTED_BASE_ROLES, '✅ Verified']) {
    if (roleNames.has(expectedRole.toLowerCase())) {
      changes.push({
        id: `map-role-${expectedRole.toLowerCase().replace(/\s+/g, '-')}`,
        kind: 'map_existing_role',
        targetName: expectedRole,
        reason: 'Existing role discovered; name and permissions remain untouched.',
        nonDestructive: true,
        applied: true,
      });
    } else {
      changes.push({
        id: `create-role-${expectedRole.toLowerCase().replace(/\s+/g, '-')}`,
        kind: 'create_role',
        targetName: expectedRole,
        reason: 'Role not yet present; will be created additively only after explicit admin confirmation.',
        nonDestructive: true,
        applied: false,
      });
    }
  }

  return changes;
}
