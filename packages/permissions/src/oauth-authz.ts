import type { GuildState, GuildMemberRecord, AuthUserSession, ClanRankName } from '../../shared/src/types.ts';
import { LEGACY_ROLE_SPECS, LEADERSHIP_CLAN_RANKS } from '../../shared/src/legacy-template.ts';
import { getCapabilitiesForRank, resolveClanRankFromRoleNames } from './hierarchy.ts';

export interface DiscordOAuthVerificationInput {
  discordUser: { id: string; username: string; avatar: string | null };
  userGuildIds: string[];
  targetGuildId: string;
  liveMemberRoleIds: string[] | null; // null if bot cannot fetch live member or member not in guild
  liveGuildCheckAttempted?: boolean;
  guildState: GuildState | null;
  explicitAuthorizedUserIds?: string[];
}

export interface DiscordOAuthAuthorizationResult {
  authorized: boolean;
  reason: string;
  statusCode: 200 | 403;
  session: AuthUserSession | null;
}

export function sessionCanAccessGuild(
  session: Pick<AuthUserSession, 'guildId'>,
  requestedGuildId: string,
  defaultGuildId: string,
): boolean {
  return requestedGuildId === (session.guildId || defaultGuildId);
}

/**
 * Default-deny Discord OAuth2 authorization check.
 * Requires:
 * 1. Verified membership in target Discord guild.
 * 2. Verified authorized leadership role (👑 Shadow King, 🛡️ Shadow Council, ⚔️ Warlord)
 *    resolved from live Discord roles (preferred) or verified non-departed guild member record,
 *    OR explicit administrator user ID override configured on the server.
 * Never defaults missing/unknown users to Shadow Council or 🌱 Recruit.
 */
export function resolveAuthorizedDiscordOAuthSession(
  input: DiscordOAuthVerificationInput,
): DiscordOAuthAuthorizationResult {
  const { discordUser, userGuildIds, targetGuildId, liveMemberRoleIds, liveGuildCheckAttempted, guildState } = input;
  const inUserGuildList = userGuildIds.includes(targetGuildId);
  const explicitOverride = input.explicitAuthorizedUserIds?.includes(discordUser.id) ?? false;

  const storedMember: GuildMemberRecord | undefined = guildState?.members.find(
    (m) => m.userId === discordUser.id && !m.isDeparted,
  );

  const hasLiveMember = Array.isArray(liveMemberRoleIds);
  // If a live guild member lookup ran against Discord and confirmed 404 (not in guild), deny even if cached guild list was stale
  const guildVerified = liveGuildCheckAttempted ? hasLiveMember : hasLiveMember || inUserGuildList;

  if (!guildVerified) {
    return {
      authorized: false,
      statusCode: 403,
      reason: `Discord user "${discordUser.username}" (${discordUser.id}) is not a verified member of target guild "${targetGuildId}". Access denied by default.`,
      session: null,
    };
  }

  let resolvedRank: ClanRankName | null = null;
  const discordRoleIds = liveMemberRoleIds ?? [];

  if (hasLiveMember && guildState) {
    // Resolve clan rank strictly from live Discord role IDs mapped in discovery snapshot (never from class/language/notification roles)
    const rankRoles = guildState.discovery.roles
      .filter((r) => r.category === 'clan_rank' && r.discordRoleId && discordRoleIds.includes(r.discordRoleId))
      .sort((a, b) => b.rankOrder - a.rankOrder);

    if (rankRoles.length > 0) {
      const matchedSpec = LEGACY_ROLE_SPECS.find((s) => s.key === rankRoles[0].id || s.name === rankRoles[0].name);
      if (matchedSpec && matchedSpec.category === 'clan_rank') {
        resolvedRank = matchedSpec.name as ClanRankName;
      }
    }
  } else if (storedMember && storedMember.verified && storedMember.hasClanRank !== false && storedMember.clanRank) {
    resolvedRank = storedMember.clanRank;
  }

  if (!resolvedRank && explicitOverride) {
    resolvedRank = '👑 Shadow King';
  }

  if (!resolvedRank || !LEADERSHIP_CLAN_RANKS.includes(resolvedRank)) {
    return {
      authorized: false,
      statusCode: 403,
      reason: resolvedRank
        ? `Role "${resolvedRank}" is not authorized for inner-sanctum administration.`
        : `No authorized leadership Discord role (👑 Shadow King, 🛡️ Shadow Council, ⚔️ Warlord) verified for "${discordUser.username}". Access denied by default.`,
      session: null,
    };
  }

  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : null;

  const nowIso = new Date().toISOString();

  return {
    authorized: true,
    statusCode: 200,
    reason: `Verified guild membership and leadership rank ${resolvedRank}.`,
    session: {
      userId: discordUser.id,
      username: discordUser.username,
      avatarUrl,
      provider: 'discord_oauth',
      clanRank: resolvedRank,
      guildVerified: true,
      guildId: targetGuildId,
      discordRoleIds,
      permissions: getCapabilitiesForRank(resolvedRank),
      lastVerifiedAt: nowIso,
      expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
    },
  };
}

/**
 * Re-verifies an active `discord_oauth` session against current Discord guild membership / roles
 * and persisted guild state so demoted or removed members lose access immediately.
 */
export function revalidateDiscordOAuthSession(input: {
  session: AuthUserSession;
  guildState: GuildState | null;
  liveMemberRoleNames?: string[] | null;
  liveMemberRoleIds?: string[] | null;
  liveCheckAttempted?: boolean;
  explicitAuthorizedUserIds?: string[];
}): { valid: boolean; reason: string; updatedSession?: AuthUserSession } {
  const { session, guildState, liveMemberRoleNames, liveMemberRoleIds, liveCheckAttempted } = input;
  if (session.provider !== 'discord_oauth') {
    return { valid: true, reason: 'Non-OAuth admin session.' };
  }

  const explicitOverride = input.explicitAuthorizedUserIds?.includes(session.userId) ?? false;

  // If live Discord check ran and member is no longer in the guild (404 / null)
  if (liveCheckAttempted && !liveMemberRoleNames && !liveMemberRoleIds) {
    return {
      valid: false,
      reason: `Discord user "${session.username}" is no longer a member of the target guild.`,
    };
  }

  let currentRank: ClanRankName | null = null;

  if (Array.isArray(liveMemberRoleNames)) {
    currentRank = resolveClanRankFromRoleNames(liveMemberRoleNames);
  } else if (Array.isArray(liveMemberRoleIds) && guildState) {
    const rankRoles = guildState.discovery.roles
      .filter((r) => r.category === 'clan_rank' && r.discordRoleId && liveMemberRoleIds.includes(r.discordRoleId))
      .sort((a, b) => b.rankOrder - a.rankOrder);
    if (rankRoles.length > 0) {
      currentRank = rankRoles[0].name as ClanRankName;
    }
  } else if (guildState) {
    const stored = guildState.members.find((m) => m.userId === session.userId);
    if (stored) {
      if (stored.isDeparted || !stored.verified || stored.hasClanRank === false || !stored.clanRank) {
        if (!explicitOverride) {
          return {
            valid: false,
            reason: 'Member no longer holds an active verified leadership clan rank.',
          };
        }
      } else {
        currentRank = stored.clanRank;
      }
    } else {
      currentRank = session.clanRank;
    }
  } else {
    currentRank = session.clanRank;
  }

  if (!currentRank && explicitOverride) {
    currentRank = '👑 Shadow King';
  }

  if (!currentRank || !LEADERSHIP_CLAN_RANKS.includes(currentRank)) {
    return {
      valid: false,
      reason: `Current role (${currentRank ?? 'Unranked'}) is no longer authorized for inner-sanctum administration.`,
    };
  }

  return {
    valid: true,
    reason: 'Discord OAuth2 session re-verified.',
    updatedSession: {
      ...session,
      clanRank: currentRank,
      permissions: getCapabilitiesForRank(currentRank),
      discordRoleIds: Array.isArray(liveMemberRoleIds) ? liveMemberRoleIds : session.discordRoleIds,
      lastVerifiedAt: new Date().toISOString(),
    },
  };
}

