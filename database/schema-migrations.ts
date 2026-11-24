import type {
  ClanRankName,
  DatabaseRoot,
  ProposedSetupChange,
  ResourceLifecycleState,
} from '../packages/shared/src/types.ts';
import { LEGACY_ROLE_SPECS } from '../packages/shared/src/legacy-template.ts';
import { CURRENT_SCHEMA_VERSION, createInitialGuildSeed } from '../packages/database/src/seed.ts';

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
 * Upgrades v1/v2 snapshots safely to v3 (Phase 0.2 canonical legacy reconstruction)
 * without losing guild, moderation, ticket, member, or language records.
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
    if (!guild.onboardingRecords) guild.onboardingRecords = [];
    if (!guild.customResponses) guild.customResponses = [];
    if (!guild.falsePositiveReports) guild.falsePositiveReports = [];

    if (guild.onboarding) {
      guild.onboarding.rulesMessageId = guild.onboarding.rulesMessageId ?? null;
      guild.onboarding.rulesReactionEmoji = guild.onboarding.rulesReactionEmoji || '✅';
      guild.onboarding.rulesPublishedAt = guild.onboarding.rulesPublishedAt ?? null;
      guild.onboarding.roleSelectionChannelNames =
        guild.onboarding.roleSelectionChannelNames ?? ['🎭・choose-your-role', '🎭・выбор-ролей'];
      guild.onboarding.recruitRoleName = guild.onboarding.recruitRoleName || '🌱 Recruit';
      guild.onboarding.autoAssignRecruitOnVerify = false;
      if (guild.onboarding.welcomeChannelName === 'welcome') guild.onboarding.welcomeChannelName = '👋・welcome';
      if (guild.onboarding.rulesChannelName === 'rules') guild.onboarding.rulesChannelName = '📜・rules';
      if (guild.onboarding.welcomeLogChannelName === 'sanctum-audit-logs') {
        guild.onboarding.welcomeLogChannelName = '🛡️・moderation-log';
      }
    }

    if (guild.discovery) {
      if (!guild.discovery.uncategorizedChannels) guild.discovery.uncategorizedChannels = [];
      if (!guild.discovery.optionalChannels) guild.discovery.optionalChannels = [];
      if (!guild.discovery.incorrectPlacements) guild.discovery.incorrectPlacements = [];
      if (!guild.discovery.incorrectTypes) guild.discovery.incorrectTypes = [];
      if (!guild.discovery.permissionDifferences) guild.discovery.permissionDifferences = [];

      // If upgrading an un-discovered v1/v2 seed snapshot (zero live Discord IDs), refresh template to canonical v3
      const hasLiveMappedResources =
        (guild.discovery.categories ?? []).some((c) => Boolean(c.discordCategoryId)) ||
        (guild.discovery.roles ?? []).some((r) => Boolean(r.discordRoleId));

      if (prevVersion < 3 && !hasLiveMappedResources) {
        const canonicalSeed = createInitialGuildSeed(guild.guildId, guild.guildName);
        guild.discovery = canonicalSeed.discovery;
        guild.rolePanels = guild.rolePanels?.length ? guild.rolePanels : canonicalSeed.rolePanels;
      } else {
        guild.discovery.categories = (guild.discovery.categories ?? []).map((cat) => ({
          ...cat,
          lifecycleState: cat.lifecycleState ?? (cat.discordCategoryId ? 'mapped' : 'proposed'),
          permissionOverwrites: cat.permissionOverwrites ?? [],
          channels: (cat.channels ?? []).map((ch) => ({
            ...ch,
            topic: ch.topic ?? '',
            readOnlyForMembers: ch.readOnlyForMembers ?? false,
            accessClassification: ch.accessClassification ?? (ch.isPrivateLeadership ? 'leadership_only' : 'verified_member'),
            required: ch.required ?? true,
            permissionOverwrites: ch.permissionOverwrites ?? [],
            lifecycleState: ch.lifecycleState ?? (ch.discordChannelId ? 'mapped' : 'proposed'),
          })),
        }));

        guild.discovery.roles = (guild.discovery.roles ?? []).map((role, idx) => {
          const spec = LEGACY_ROLE_SPECS.find((s) => s.key === role.id || s.name === role.name);
          return {
            ...role,
            aliases: role.aliases ?? spec?.aliases ?? [],
            position: role.position ?? Math.max(1, 20 - idx),
            permissionsBitfield: role.permissionsBitfield ?? '0',
            intendedPermissions: role.intendedPermissions ?? spec?.intendedPermissions ?? [],
            colorHex: role.discoveredFromExisting ? role.colorHex ?? null : null,
            hoist: role.hoist ?? null,
            excludeFromAutoSetup: role.excludeFromAutoSetup ?? spec?.excludeFromAutoSetup ?? false,
            requiresAdminReview: role.requiresAdminReview ?? spec?.requiresAdminReview ?? true,
            lifecycleState: role.lifecycleState ?? (role.mapped ? 'mapped' : 'proposed'),
          };
        });

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
      }

      if (guild.discovery.conflictsCount === undefined) {
        guild.discovery.conflictsCount = guild.discovery.proposedChanges.filter((c) => c.status === 'conflicting').length;
      }
      if (guild.discovery.missingCount === undefined) {
        guild.discovery.missingCount = guild.discovery.proposedChanges.filter(
          (c) => c.status === 'missing' || c.status === 'proposed' || c.status === 'failed',
        ).length;
      }
    }

    guild.members = (guild.members ?? []).map((m) => ({
      ...m,
      clanRank: normalizeClanRank(m.clanRank),
      hasClanRank: m.hasClanRank ?? true,
      notificationRoles: m.notificationRoles ?? [],
    }));

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
