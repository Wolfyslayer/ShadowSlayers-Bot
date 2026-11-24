import type { GuildState, GuildMemberRecord, AuthUserSession, ClanRankName } from '../../shared/src/types.ts';
import { LEGACY_ROLE_SPECS, LEADERSHIP_CLAN_RANKS } from '../../shared/src/legacy-template.ts';
import { getCapabilitiesForRank } from './hierarchy.ts';

export interface DiscordOAuthVerificationInput {
  discordUser: { id: string; username: string; avatar: string | null };
  userGuildIds: string[];
  targetGuildId: string;
  liveMemberRoleIds: string[] | null; // null if bot token not connected to fetch live member roles
  guildState: GuildState | null;
  explicitAuthorizedUserIds?: string[];
}

export interface DiscordOAuthAuthorizationResult {
  authorized: boolean;
  reason: string;
  statusCode: 200 | 403;
  session: AuthUserSession | null;
}

/**
 * Default-deny Discord OAuth2 authorization check.
 * Requires:
 * 1. Verified membership in target Discord guild.
 * 2. Verified authorized leadership role (👑 Shadow King, 🛡️ Shadow Council, ⚔️ Warlord)
 *    resolved from live Discord roles (preferred) or verified non-departed guild member record,
 *    OR explicit administrator user ID override configured on the server.
 * Never defaults missing/unknown users to Shadow Council.
 */
export function resolveAuthorizedDiscordOAuthSession(
  input: DiscordOAuthVerificationInput,
): DiscordOAuthAuthorizationResult {
  const { discordUser, userGuildIds, targetGuildId, liveMemberRoleIds, guildState } = input;
  const inUserGuildList = userGuildIds.includes(targetGuildId);
  const explicitOverride = input.explicitAuthorizedUserIds?.includes(discordUser.id) ?? false;

  const storedMember: GuildMemberRecord | undefined = guildState?.members.find(
    (m) => m.userId === discordUser.id && !m.isDeparted,
  );

  // Must verify guild membership either via Discord live member fetch, OAuth guilds scope, or active member record
  const hasLiveMember = Array.isArray(liveMemberRoleIds);
  const guildVerified = hasLiveMember || inUserGuildList;

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
    // Resolve clan rank strictly from live Discord role IDs mapped in discovery snapshot
    const rankRoles = guildState.discovery.roles
      .filter((r) => r.category === 'clan_rank' && r.discordRoleId && discordRoleIds.includes(r.discordRoleId))
      .sort((a, b) => b.rankOrder - a.rankOrder);

    if (rankRoles.length > 0) {
      const matchedSpec = LEGACY_ROLE_SPECS.find((s) => s.key === rankRoles[0].id || s.name === rankRoles[0].name);
      if (matchedSpec) {
        resolvedRank = matchedSpec.name as ClanRankName;
      }
    }
  } else if (storedMember && storedMember.verified) {
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
      discordRoleIds,
      permissions: getCapabilitiesForRank(resolvedRank),
      expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
    },
  };
}
