import {
  CLAN_RANK_ORDER,
  type ClanRankName,
  type DiscoveredCategory,
  type DiscoveredChannel,
  type GuildMemberRecord,
  type GuildRoleRecord,
  type PermissionAuditFinding,
} from '../../shared/src/types.ts';
import { LEGACY_CHANNEL_SPECS, LEGACY_ROLE_SPECS, LEADERSHIP_CLAN_RANKS } from '../../shared/src/legacy-template.ts';

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

export function isLeadershipRank(rank: ClanRankName | null | undefined): boolean {
  if (!rank) return false;
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
 * - Clan ranks AND `✅ Verified` are NEVER self-assignable via public role panels.
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
  const isProtectedTarget = LEGACY_ROLE_SPECS.some(
    (r) =>
      (r.category === 'clan_rank' || r.category === 'verified' || r.category === 'system') &&
      (r.name === selectedValue || r.aliases.includes(selectedValue)),
  );
  if (isProtectedTarget) {
    return {
      allowed: false,
      reason: 'Clan ranks, Bots, and ✅ Verified cannot be self-assigned through public role panels.',
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
      clanRank: member.clanRank,
      languageCodes: [code],
      gamingClasses: [...member.gamingClasses],
      notificationRoles: [...member.notificationRoles],
    };
  }

  if (group === 'class') {
    return {
      allowed: true,
      clanRank: member.clanRank,
      languageCodes: [...member.languageCodes],
      gamingClasses: [selectedValue],
      notificationRoles: [...member.notificationRoles],
    };
  }

  const exists = member.notificationRoles.includes(selectedValue);
  const nextNotifications = exists
    ? member.notificationRoles.filter((n) => n !== selectedValue)
    : [...member.notificationRoles, selectedValue];

  return {
    allowed: true,
    clanRank: member.clanRank,
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

export interface EffectiveChannelAccessMember {
  verified: boolean;
  clanRank: ClanRankName | null;
  hasClanRank?: boolean;
  languageCodes: string[];
  gamingClasses: string[];
  notificationRoles: string[];
}

/**
 * Evaluates effective Discord channel view + send access under Discord's logical-OR role resolution:
 * - `@everyone` MUST deny ViewChannel on protected categories (`verified_member`, `clan_member`, `class_hall`, `leadership_only`).
 * - Verification gate: unverified members are denied `verified_member`, `clan_member`, `class_hall`, and `leadership_only`
 *   EVEN IF they hold Recruit, Class, Language, or Notification roles.
 * - Read-only channels deny `SendMessages` for ordinary members; only Leadership (`👑 Shadow King`, `🛡️ Shadow Council`, `⚔️ Warlord`) can post.
 */
export function evaluateEffectiveChannelAccess(
  member: EffectiveChannelAccessMember,
  accessClassification: DiscoveredChannel['accessClassification'],
  requiredClassRoleName?: string,
  readOnlyForMembers = false,
  requiredLanguageCode?: string,
): { canView: boolean; canSend: boolean; reason: string } {
  const activeClanRank: ClanRankName | null = member.hasClanRank === false ? null : member.clanRank;
  const isLeader = member.verified && isLeadershipRank(activeClanRank);

  if (accessClassification === 'public_onboarding') {
    return {
      canView: true,
      canSend: readOnlyForMembers ? isLeader : true,
      reason: readOnlyForMembers && !isLeader
        ? 'Public Gate of Shadows channel (read-only for ordinary members).'
        : 'Public Gate of Shadows onboarding channel.',
    };
  }

  if (!member.verified) {
    return {
      canView: false,
      canSend: false,
      reason: 'Member lacks ✅ Verified role; blocked at Gate of Shadows regardless of other roles.',
    };
  }

  if (accessClassification === 'verified_member') {
    if (requiredLanguageCode && !isLeader && !member.languageCodes.includes(requiredLanguageCode)) {
      return {
        canView: false,
        canSend: false,
        reason: `Language realm requires "${requiredLanguageCode}" language role.`,
      };
    }
    return {
      canView: true,
      canSend: readOnlyForMembers ? isLeader : true,
      reason: readOnlyForMembers && !isLeader
        ? 'Member holds ✅ Verified; channel is read-only for ordinary members.'
        : 'Member holds ✅ Verified.',
    };
  }

  if (accessClassification === 'class_hall') {
    if (isLeader) {
      return { canView: true, canSend: true, reason: 'Leadership rank authorized across Class Halls.' };
    }
    const hasMatchingClass = requiredClassRoleName
      ? member.gamingClasses.includes(requiredClassRoleName)
      : member.gamingClasses.length > 0;
    return hasMatchingClass
      ? { canView: true, canSend: !readOnlyForMembers, reason: 'Verified member holds matching exclusive class role.' }
      : { canView: false, canSend: false, reason: 'Missing matching exclusive class role for this Class Hall.' };
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
    const hasRank = activeClanRank !== null && clanRanksAllowed.includes(activeClanRank);
    if (!hasRank) {
      return { canView: false, canSend: false, reason: 'Requires verified clan rank (🌱 Recruit or above).' };
    }
    return {
      canView: true,
      canSend: readOnlyForMembers ? isLeader : true,
      reason: readOnlyForMembers && !isLeader
        ? `Verified clan member (${activeClanRank}); channel is read-only for ordinary members.`
        : `Verified clan member (${activeClanRank}).`,
    };
  }

  if (accessClassification === 'leadership_only') {
    return isLeader
      ? { canView: true, canSend: true, reason: `Leadership rank (${activeClanRank}) authorized for Inner Sanctum.` }
      : { canView: false, canSend: false, reason: 'Ordinary clan/language/notification roles denied Inner Sanctum access.' };
  }

  return { canView: false, canSend: false, reason: 'Denied by default.' };
}

/**
 * Audits live/discovered guild categories, channels, and permission overwrites
 * against the canonical Phase 0.2 legacy security policy without modifying anything.
 */
export function auditGuildPermissions(
  categories: DiscoveredCategory[],
  roles: GuildRoleRecord[],
  everyoneRoleId?: string,
): PermissionAuditFinding[] {
  const findings: PermissionAuditFinding[] = [];
  const roleById = new Map(roles.filter((r) => r.discordRoleId).map((r) => [r.discordRoleId!, r]));

  const isEveryone = (ow: { targetId: string; targetName: string }) =>
    ow.targetName === '@everyone' || (everyoneRoleId ? ow.targetId === everyoneRoleId : false);

  for (const cat of categories) {
    if (!cat.discoveredFromExisting || !cat.discordCategoryId) continue;

    if (cat.id !== 'cat_01_gate') {
      const everyoneOw = cat.permissionOverwrites.find(isEveryone);
      const deniesView = everyoneOw?.deny.includes('ViewChannel') ?? false;
      if (!deniesView) {
        findings.push({
          id: `perm-cat-everyone-${cat.id}`,
          severity: cat.isPrivateLeadership ? 'critical' : 'warning',
          targetType: 'category',
          targetName: cat.name,
          summary: `@everyone does not explicitly deny ViewChannel on protected category "${cat.name}".`,
          expectedPolicy: '@everyone ViewChannel = Deny to enforce verification/clan/leadership gates under Discord OR rules.',
          actualState: everyoneOw ? `deny=[${everyoneOw.deny.join(', ')}]` : 'No @everyone overwrite',
        });
      }
    }

    if (cat.isPrivateLeadership) {
      for (const ow of cat.permissionOverwrites) {
        if (ow.targetType !== 'role' || isEveryone(ow)) continue;
        const matchedRole = roleById.get(ow.targetId);
        const roleName = matchedRole?.name ?? ow.targetName;
        if (
          ow.allow.includes('ViewChannel') &&
          !LEADERSHIP_CLAN_RANKS.includes(roleName as ClanRankName)
        ) {
          findings.push({
            id: `perm-sanctum-leak-${cat.id}-${ow.targetId}`,
            severity: 'critical',
            targetType: 'category',
            targetName: cat.name,
            summary: `Non-leadership role "${roleName}" has explicit ViewChannel allow on Inner Sanctum.`,
            expectedPolicy: 'Only 👑 Shadow King, 🛡️ Shadow Council, and ⚔️ Warlord may view Inner Sanctum.',
            actualState: `${roleName} allow=[${ow.allow.join(', ')}]`,
          });
        }
      }
    }

    for (const ch of cat.channels) {
      if (!ch.discoveredFromExisting || !ch.discordChannelId) continue;
      const spec = LEGACY_CHANNEL_SPECS.find((s) => s.key === ch.id || s.name === ch.name);
      const isReadOnly = ch.readOnlyForMembers || Boolean(spec?.readOnlyForMembers);
      if (isReadOnly) {
        const everyoneChOw = ch.permissionOverwrites.find(isEveryone);
        const deniesSend = everyoneChOw?.deny.includes('SendMessages') ?? false;
        if (!deniesSend) {
          findings.push({
            id: `perm-ro-${ch.id}`,
            severity: 'warning',
            targetType: 'channel',
            targetName: ch.name,
            summary: `Read-only legacy channel "${ch.name}" lacks explicit @everyone SendMessages Deny overwrite.`,
            expectedPolicy: '@everyone SendMessages = Deny (leadership only may post).',
            actualState: everyoneChOw ? `deny=[${everyoneChOw.deny.join(', ')}]` : 'No @everyone overwrite',
          });
        }
      }

      if (ch.accessClassification === 'class_hall') {
        const everyoneChOw = ch.permissionOverwrites.find(isEveryone);
        const deniesView = everyoneChOw?.deny.includes('ViewChannel') ?? false;
        if (!deniesView) {
          findings.push({
            id: `perm-class-gate-${ch.id}`,
            severity: 'warning',
            targetType: 'channel',
            targetName: ch.name,
            summary: `Class Hall "${ch.name}" does not explicitly deny @everyone ViewChannel.`,
            expectedPolicy: '@everyone ViewChannel = Deny; allow only matching Class role + Leadership.',
            actualState: everyoneChOw ? `deny=[${everyoneChOw.deny.join(', ')}]` : 'No @everyone overwrite',
          });
        }
      }
    }
  }

  return findings;
}

export function getRankHierarchyTable() {
  return CLAN_RANK_ORDER.map((rank) => ({
    rank,
    weight: RANK_WEIGHTS[rank],
    capabilities: RANK_CAPABILITIES[rank],
  }));
}
