import { CLAN_RANK_ORDER, type ClanRankName, type DiscoveredChannel, type GuildMemberRecord } from '../../shared/src/types.ts';
import { LEGACY_ROLE_SPECS, LEADERSHIP_CLAN_RANKS } from '../../shared/src/legacy-template.ts';

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
  '👑 Shadow King': 600,
  '🛡️ Shadow Council': 500,
  '⚔️ Warlord': 400,
  '🔥 Elite Warrior': 300,
  '🖤 ShadowSlayer': 200,
  '🌱 Recruit': 100,
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
  '👑 Shadow King': ALL_CAPABILITIES,
  '🛡️ Shadow Council': ALL_CAPABILITIES.filter((c) => c !== 'settings.manage' || true),
  '⚔️ Warlord': [
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
  '🔥 Elite Warrior': [
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
  '🖤 ShadowSlayer': ['overview.view', 'members.view', 'tickets.view', 'community.manage'],
  '🌱 Recruit': ['overview.view'],
};

export function getRankWeight(rank: ClanRankName): number {
  return RANK_WEIGHTS[rank] ?? 0;
}

export function isLeadershipRank(rank: ClanRankName): boolean {
  return LEADERSHIP_CLAN_RANKS.includes(rank);
}

export function getCapabilitiesForRank(rank: ClanRankName): PermissionCapability[] {
  return [...(RANK_CAPABILITIES[rank] ?? [])];
}

export function hasCapability(rank: ClanRankName, capability: PermissionCapability): boolean {
  return RANK_CAPABILITIES[rank]?.includes(capability) ?? false;
}

export function canActOnTargetRank(actorRank: ClanRankName, targetRank: ClanRankName): boolean {
  if (actorRank === '👑 Shadow King' && targetRank !== '👑 Shadow King') {
    return true;
  }
  return getRankWeight(actorRank) > getRankWeight(targetRank);
}

export function canAssignClanRank(actorRank: ClanRankName, desiredRank: ClanRankName): boolean {
  if (actorRank === '👑 Shadow King') {
    return true;
  }
  return getRankWeight(actorRank) > getRankWeight(desiredRank);
}

export function canBotManageRolePosition(botHighestPosition: number, targetRolePosition: number): boolean {
  return botHighestPosition > targetRolePosition;
}

export function canBotModerateMemberPosition(botHighestPosition: number, targetHighestPosition: number): boolean {
  return botHighestPosition > targetHighestPosition;
}

/**
 * Legacy-compatible self-assignable role selector.
 * - Language: exclusive (`🇬🇧 English` OR `🇷🇺 Русский`)
 * - Class: exclusive (`⚔️ Warrior` OR `🔮 Sorcerer` OR `🗡️ Swordsman`)
 * - Notifications: multiple (`📢 Event Pings`, `🐉 Boss Pings`, `🏆 PvP Pings`)
 * - Clan ranks are NEVER self-assignable and NEVER altered by self-role updates.
 */
export function applySelfRoleSelection(
  member: Pick<GuildMemberRecord, 'clanRank' | 'languageCodes' | 'gamingClasses' | 'notificationRoles'>,
  group: 'language' | 'class' | 'notification',
  selectedValue: string,
): {
  allowed: boolean;
  reason?: string;
  clanRank: ClanRankName;
  languageCodes: string[];
  gamingClasses: string[];
  notificationRoles: string[];
} {
  // Block any attempt to self-assign a clan rank
  const isClanRankTarget = LEGACY_ROLE_SPECS.some(
    (r) => r.category === 'clan_rank' && (r.name === selectedValue || r.aliases.includes(selectedValue)),
  );
  if (isClanRankTarget) {
    return {
      allowed: false,
      reason: 'Clan ranks are assigned exclusively by authorized leadership and cannot be self-assigned.',
      clanRank: member.clanRank,
      languageCodes: [...member.languageCodes],
      gamingClasses: [...member.gamingClasses],
      notificationRoles: [...member.notificationRoles],
    };
  }

  if (group === 'language') {
    const code = selectedValue.toLowerCase().trim();
    return {
      allowed: true,
      clanRank: member.clanRank, // Strictly preserved
      languageCodes: [code], // Exclusive language selection
      gamingClasses: [...member.gamingClasses],
      notificationRoles: [...member.notificationRoles],
    };
  }

  if (group === 'class') {
    return {
      allowed: true,
      clanRank: member.clanRank, // Strictly preserved
      languageCodes: [...member.languageCodes],
      gamingClasses: [selectedValue], // Exclusive class selection
      notificationRoles: [...member.notificationRoles],
    };
  }

  // Notification: multiple toggle
  const exists = member.notificationRoles.includes(selectedValue);
  const nextNotifications = exists
    ? member.notificationRoles.filter((n) => n !== selectedValue)
    : [...member.notificationRoles, selectedValue];

  return {
    allowed: true,
    clanRank: member.clanRank, // Strictly preserved
    languageCodes: [...member.languageCodes],
    gamingClasses: [...member.gamingClasses],
    notificationRoles: nextNotifications,
  };
}

export function mergeIndependentLanguageRoles(
  existingLanguages: string[],
  requestedLanguages: string[],
  enabledLanguageCodes: string[],
): string[] {
  const allowed = new Set(enabledLanguageCodes.map((c) => c.toLowerCase()));
  const merged = requestedLanguages
    .map((c) => c.toLowerCase().trim())
    .filter((c) => allowed.has(c));

  for (const prev of existingLanguages) {
    if (!allowed.has(prev) && !merged.includes(prev)) {
      merged.push(prev);
    }
  }
  return Array.from(new Set(merged));
}

/**
 * Evaluates effective Discord channel access under Discord's actual permission resolution rules:
 * Role allow overwrites OR across a member's roles. Therefore:
 * - `@everyone` MUST be denied ViewChannel on protected categories (`verified_member`, `clan_member`, `class_hall`, `leadership_only`).
 * - Verification gate: unverified members are denied `verified_member`, `clan_member`, `class_hall`, and `leadership_only`
 *   EVEN IF they somehow received Recruit, Class, Language, or Notification roles (enforced both by onboarding gate and permission audit).
 */
export function evaluateEffectiveChannelAccess(
  member: Pick<GuildMemberRecord, 'verified' | 'clanRank' | 'languageCodes' | 'gamingClasses' | 'notificationRoles'>,
  accessClassification: DiscoveredChannel['accessClassification'],
  requiredClassRoleName?: string,
): { canView: boolean; reason: string } {
  if (accessClassification === 'public_onboarding') {
    return { canView: true, reason: 'Public Gate of Shadows onboarding channel.' };
  }

  // Verification boundary: unverified members cannot bypass into verified, clan, class, or leadership areas
  if (!member.verified) {
    return {
      canView: false,
      reason: 'Member lacks ✅ Verified role; blocked at Gate of Shadows regardless of other roles.',
    };
  }

  if (accessClassification === 'verified_member') {
    return { canView: true, reason: 'Member holds ✅ Verified.' };
  }

  if (accessClassification === 'class_hall') {
    if (isLeadershipRank(member.clanRank)) {
      return { canView: true, reason: 'Leadership rank granted audit access.' };
    }
    const hasMatchingClass = requiredClassRoleName ? member.gamingClasses.includes(requiredClassRoleName) : member.gamingClasses.length > 0;
    return hasMatchingClass
      ? { canView: true, reason: 'Verified member holds matching exclusive class role.' }
      : { canView: false, reason: 'Missing matching class role for this Class Hall.' };
  }

  if (accessClassification === 'clan_member') {
    const clanRanksAllowed: ClanRankName[] = [
      '👑 Shadow King',
      '🛡️ Shadow Council',
      '⚔️ Warlord',
      '🔥 Elite Warrior',
      '🖤 ShadowSlayer',
      '🌱 Recruit',
    ];
    return clanRanksAllowed.includes(member.clanRank)
      ? { canView: true, reason: `Verified clan member (${member.clanRank}).` }
      : { canView: false, reason: 'Requires verified clan rank.' };
  }

  if (accessClassification === 'leadership_only') {
    return isLeadershipRank(member.clanRank)
      ? { canView: true, reason: `Leadership rank (${member.clanRank}) authorized for Inner Sanctum.` }
      : { canView: false, reason: `Ordinary clan/language/notification roles denied Inner Sanctum access.` };
  }

  return { canView: false, reason: 'Denied by default.' };
}

export function getRankHierarchyTable() {
  return CLAN_RANK_ORDER.map((rank) => ({
    rank,
    weight: RANK_WEIGHTS[rank],
    capabilities: RANK_CAPABILITIES[rank],
  }));
}
