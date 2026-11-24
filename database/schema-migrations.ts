import type {
  ClanRankName,
  DatabaseRoot,
  ProposedSetupChange,
  ResourceLifecycleState,
} from '../packages/shared/src/types.ts';
import { CURRENT_SCHEMA_VERSION } from '../packages/database/src/seed.ts';

const RANK_NORMALIZATION: Record<string, ClanRankName> = {
  'Shadow King': '👑 Shadow King',
  '👑 Shadow King': '👑 Shadow King',
  'Shadow Council': '🛡️ Shadow Council',
  '🛡️ Shadow Council': '🛡️ Shadow Council',
  'Warlord': '⚔️ Warlord',
  '⚔️ Warlord': '⚔️ Warlord',
  'Elite Warrior': '🔥 Elite Warrior',
  '🔥 Elite Warrior': '🔥 Elite Warrior',
  'ShadowSlayer': '🖤 ShadowSlayer',
  '🖤 ShadowSlayer': '🖤 ShadowSlayer',
  'Recruit': '🌱 Recruit',
  '🌱 Recruit': '🌱 Recruit',
};

export function normalizeClanRank(rank: string | undefined): ClanRankName {
  if (!rank) return '🌱 Recruit';
  return RANK_NORMALIZATION[rank.trim()] ?? '🌱 Recruit';
}

/**
 * Deterministic schema migration runner.
 * Upgrades v1 snapshots safely to v2 (Phase 0.1 legacy compatibility schema)
 * without losing guild, moderation, ticket, or language records.
 */
export function migrateDatabaseRoot(raw: DatabaseRoot): DatabaseRoot {
  const root: DatabaseRoot = {
    schemaVersion: raw.schemaVersion ?? 1,
    adminAuth: raw.adminAuth ?? null,
    guilds: raw.guilds ?? {},
  };

  for (const [guildId, guild] of Object.entries(root.guilds)) {
    const prevVersion = guild.schemaVersion ?? 1;

    if (!guild.scheduledTasks) guild.scheduledTasks = [];
    if (!guild.temporaryRoles) guild.temporaryRoles = [];
    if (!guild.birthdays) guild.birthdays = [];
    if (!guild.challenges) guild.challenges = [];
    if (!guild.scheduledAnnouncements) guild.scheduledAnnouncements = [];

    // Migrate discovery snapshot to Phase 0.1 fields
    if (guild.discovery) {
      if (!guild.discovery.uncategorizedChannels) guild.discovery.uncategorizedChannels = [];
      guild.discovery.categories = (guild.discovery.categories ?? []).map((cat) => ({
        ...cat,
        lifecycleState: cat.lifecycleState ?? (cat.discordCategoryId ? 'mapped' : 'proposed'),
        permissionOverwrites: cat.permissionOverwrites ?? [],
        channels: (cat.channels ?? []).map((ch) => ({
          ...ch,
          topic: ch.topic ?? '',
          accessClassification: ch.accessClassification ?? (ch.isPrivateLeadership ? 'leadership_only' : 'verified_member'),
          required: ch.required ?? true,
          permissionOverwrites: ch.permissionOverwrites ?? [],
          lifecycleState: ch.lifecycleState ?? (ch.discordChannelId ? 'mapped' : 'proposed'),
        })),
      }));

      guild.discovery.roles = (guild.discovery.roles ?? []).map((role, idx) => ({
        ...role,
        aliases: role.aliases ?? [],
        position: role.position ?? Math.max(1, 20 - idx),
        permissionsBitfield: role.permissionsBitfield ?? '0',
        lifecycleState: role.lifecycleState ?? (role.mapped ? 'mapped' : 'proposed'),
      }));

      guild.discovery.proposedChanges = (guild.discovery.proposedChanges ?? []).map((rawChange) => {
        const legacyChange = rawChange as ProposedSetupChange & { applied?: boolean };
        const fallbackStatus: ResourceLifecycleState = legacyChange.applied ? 'mapped' : 'proposed';
        return {
          id: legacyChange.id,
          kind: legacyChange.kind === 'create_channel' && !legacyChange.parentCategoryName ? 'create_category' : legacyChange.kind,
          targetName: legacyChange.targetName,
          parentCategoryName: legacyChange.parentCategoryName,
          reason: legacyChange.reason,
          nonDestructive: true,
          status: legacyChange.status ?? fallbackStatus,
          verifiedDiscordId: legacyChange.verifiedDiscordId ?? null,
          error: legacyChange.error ?? null,
        };
      });

      if (guild.discovery.conflictsCount === undefined) {
        guild.discovery.conflictsCount = guild.discovery.proposedChanges.filter((c) => c.status === 'conflicting').length;
      }
      if (guild.discovery.missingCount === undefined) {
        guild.discovery.missingCount = guild.discovery.proposedChanges.filter(
          (c) => c.status === 'missing' || c.status === 'proposed' || c.status === 'failed',
        ).length;
      }
    }

    // Migrate members (exact emoji-prefixed clan ranks + notificationRoles)
    guild.members = (guild.members ?? []).map((m) => ({
      ...m,
      clanRank: normalizeClanRank(m.clanRank),
      notificationRoles: m.notificationRoles ?? [],
    }));

    // Migrate moderation cases to include real Discord execution status
    guild.moderationCases = (guild.moderationCases ?? []).map((c) => ({
      ...c,
      discordExecutionStatus: c.discordExecutionStatus ?? 'dry_run_no_bot',
      discordError: c.discordError ?? null,
    }));

    if (prevVersion < CURRENT_SCHEMA_VERSION) {
      guild.schemaVersion = CURRENT_SCHEMA_VERSION;
    }
    root.guilds[guildId] = guild;
  }

  root.schemaVersion = CURRENT_SCHEMA_VERSION;
  return root;
}
