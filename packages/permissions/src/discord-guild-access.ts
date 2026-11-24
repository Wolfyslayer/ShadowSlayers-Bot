import type { PermissionCapability } from './hierarchy.ts';

export interface DiscordOAuthGuildAccess {
  id: string;
  name: string;
  owner: boolean;
  permissions: string;
}

export const DISCORD_PERMISSION_FLAGS = {
  kickMembers: 1n << 1n,
  banMembers: 1n << 2n,
  administrator: 1n << 3n,
  manageChannels: 1n << 4n,
  manageGuild: 1n << 5n,
  sendMessages: 1n << 11n,
  manageMessages: 1n << 13n,
  manageRoles: 1n << 28n,
  manageWebhooks: 1n << 29n,
  moderateMembers: 1n << 40n,
} as const;

export function discordPermissionBits(access: DiscordOAuthGuildAccess): bigint | null {
  try {
    if (!/^\d+$/.test(access.permissions)) return null;
    return BigInt(access.permissions);
  } catch {
    return null;
  }
}

export function qualifiesAsDiscordGuildManager(access: DiscordOAuthGuildAccess): boolean {
  if (access.owner) return true;
  const permissions = discordPermissionBits(access);
  if (permissions === null) return false;
  const required = DISCORD_PERMISSION_FLAGS.administrator | DISCORD_PERMISSION_FLAGS.manageGuild;
  return (permissions & required) !== 0n;
}

export function hasDiscordPermission(
  access: DiscordOAuthGuildAccess,
  permission: bigint,
): boolean {
  if (access.owner) return true;
  const permissions = discordPermissionBits(access);
  if (permissions === null) return false;
  return (permissions & DISCORD_PERMISSION_FLAGS.administrator) !== 0n || (permissions & permission) === permission;
}

export function hasDiscordDashboardCapability(
  access: DiscordOAuthGuildAccess,
  capability: PermissionCapability,
  moderationAction?: string,
): boolean {
  if (!qualifiesAsDiscordGuildManager(access)) return false;
  if (access.owner || hasDiscordPermission(access, DISCORD_PERMISSION_FLAGS.administrator)) return true;

  const has = (permission: bigint) => hasDiscordPermission(access, permission);
  switch (capability) {
    case 'overview.view':
    case 'discovery.view':
    case 'languages.view':
    case 'members.view':
    case 'roles.view':
    case 'moderation.view':
    case 'logging.view':
    case 'tickets.view':
    case 'recruitment.view':
      return true;
    case 'discovery.apply':
      return has(DISCORD_PERMISSION_FLAGS.manageChannels) && has(DISCORD_PERMISSION_FLAGS.manageRoles);
    case 'languages.manage':
    case 'recruitment.review':
    case 'community.manage':
    case 'clan.manage':
    case 'settings.manage':
      return has(DISCORD_PERMISSION_FLAGS.manageGuild);
    case 'languages.approve':
      return has(DISCORD_PERMISSION_FLAGS.manageGuild) && has(DISCORD_PERMISSION_FLAGS.manageChannels);
    case 'members.edit':
      return has(DISCORD_PERMISSION_FLAGS.manageRoles);
    case 'roles.publish':
      return has(DISCORD_PERMISSION_FLAGS.manageRoles) && has(DISCORD_PERMISSION_FLAGS.sendMessages);
    case 'moderation.execute':
      if (moderationAction === 'kick') return has(DISCORD_PERMISSION_FLAGS.kickMembers);
      if (['ban', 'tempban', 'unban'].includes(moderationAction ?? '')) {
        return has(DISCORD_PERMISSION_FLAGS.banMembers);
      }
      if (['timeout', 'untimeout'].includes(moderationAction ?? '')) {
        return has(DISCORD_PERMISSION_FLAGS.moderateMembers);
      }
      if (moderationAction === 'purge') {
        return has(DISCORD_PERMISSION_FLAGS.manageMessages);
      }
      if (['slowmode', 'lock', 'unlock'].includes(moderationAction ?? '')) {
        return has(DISCORD_PERMISSION_FLAGS.manageChannels);
      }
      return has(DISCORD_PERMISSION_FLAGS.manageGuild);
    case 'automod.manage':
      return has(DISCORD_PERMISSION_FLAGS.manageGuild) && has(DISCORD_PERMISSION_FLAGS.manageMessages);
    case 'logging.manage':
      return has(DISCORD_PERMISSION_FLAGS.manageGuild) && has(DISCORD_PERMISSION_FLAGS.manageWebhooks);
    case 'tickets.manage':
      return has(DISCORD_PERMISSION_FLAGS.manageChannels) && has(DISCORD_PERMISSION_FLAGS.manageMessages);
    default:
      return false;
  }
}
