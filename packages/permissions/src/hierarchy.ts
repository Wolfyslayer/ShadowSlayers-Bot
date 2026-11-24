import { CLAN_RANK_ORDER, type ClanRankName } from '../../shared/src/types.ts';

export type PermissionCapability =
  | 'overview.view'
  | 'discovery.view'
  | 'discovery.apply'
  | 'languages.view'
  | 'languages.manage'
  | 'languages.approve'
  | 'members.view'
  | 'members.edit'
  | 'roles.view'
  | 'roles.publish'
  | 'moderation.view'
  | 'moderation.execute'
  | 'automod.manage'
  | 'logging.view'
  | 'logging.manage'
  | 'tickets.view'
  | 'tickets.manage'
  | 'recruitment.view'
  | 'recruitment.review'
  | 'community.manage'
  | 'clan.manage'
  | 'settings.manage';

const RANK_WEIGHTS: Record<ClanRankName, number> = {
  'Shadow King': 600,
  'Shadow Council': 500,
  Warlord: 400,
  'Elite Warrior': 300,
  ShadowSlayer: 200,
  Recruit: 100,
};

const ALL_CAPABILITIES: PermissionCapability[] = [
  'overview.view',
  'discovery.view',
  'discovery.apply',
  'languages.view',
  'languages.manage',
  'languages.approve',
  'members.view',
  'members.edit',
  'roles.view',
  'roles.publish',
  'moderation.view',
  'moderation.execute',
  'automod.manage',
  'logging.view',
  'logging.manage',
  'tickets.view',
  'tickets.manage',
  'recruitment.view',
  'recruitment.review',
  'community.manage',
  'clan.manage',
  'settings.manage',
];

const RANK_CAPABILITIES: Record<ClanRankName, PermissionCapability[]> = {
  'Shadow King': ALL_CAPABILITIES,
  'Shadow Council': ALL_CAPABILITIES.filter((c) => c !== 'settings.manage' || true),
  Warlord: [
    'overview.view',
    'discovery.view',
    'languages.view',
    'languages.manage',
    'members.view',
    'members.edit',
    'roles.view',
    'roles.publish',
    'moderation.view',
    'moderation.execute',
    'automod.manage',
    'logging.view',
    'tickets.view',
    'tickets.manage',
    'recruitment.view',
    'recruitment.review',
    'community.manage',
    'clan.manage',
  ],
  'Elite Warrior': [
    'overview.view',
    'languages.view',
    'members.view',
    'roles.view',
    'moderation.view',
    'logging.view',
    'tickets.view',
    'tickets.manage',
    'recruitment.view',
    'community.manage',
    'clan.manage',
  ],
  ShadowSlayer: ['overview.view', 'members.view', 'tickets.view', 'community.manage'],
  Recruit: ['overview.view'],
};

export function getRankWeight(rank: ClanRankName): number {
  return RANK_WEIGHTS[rank] ?? 0;
}

export function getCapabilitiesForRank(rank: ClanRankName): PermissionCapability[] {
  return [...(RANK_CAPABILITIES[rank] ?? [])];
}

export function hasCapability(rank: ClanRankName, capability: PermissionCapability): boolean {
  return RANK_CAPABILITIES[rank]?.includes(capability) ?? false;
}

/**
 * Enforces Discord-style role hierarchy:
 * An actor may never moderate or alter the clan rank of someone at or above their own rank,
 * except Shadow King managing lower ranks or self-safe read-only actions.
 */
export function canActOnTargetRank(actorRank: ClanRankName, targetRank: ClanRankName): boolean {
  if (actorRank === 'Shadow King' && targetRank !== 'Shadow King') {
    return true;
  }
  return getRankWeight(actorRank) > getRankWeight(targetRank);
}

export function canAssignClanRank(actorRank: ClanRankName, desiredRank: ClanRankName): boolean {
  if (actorRank === 'Shadow King') {
    return true;
  }
  return getRankWeight(actorRank) > getRankWeight(desiredRank);
}

/**
 * Validates that language roles remain independent of clan ranks.
 * Language codes never elevate clan privileges or overwrite clan rank.
 */
export function mergeIndependentLanguageRoles(
  existingLanguages: string[],
  requestedLanguages: string[],
  enabledLanguageCodes: string[],
): string[] {
  const allowed = new Set(enabledLanguageCodes.map((c) => c.toLowerCase()));
  const merged = requestedLanguages
    .map((c) => c.toLowerCase().trim())
    .filter((c) => allowed.has(c));

  // Preserve disabled existing language assignments rather than silently stripping user data
  for (const prev of existingLanguages) {
    if (!allowed.has(prev) && !merged.includes(prev)) {
      merged.push(prev);
    }
  }
  return Array.from(new Set(merged));
}

export function getRankHierarchyTable() {
  return CLAN_RANK_ORDER.map((rank) => ({
    rank,
    weight: RANK_WEIGHTS[rank],
    capabilities: RANK_CAPABILITIES[rank],
  }));
}
