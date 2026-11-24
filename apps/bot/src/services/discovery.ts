import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { auditGuildPermissions } from '../../../../packages/permissions/src/hierarchy.ts';
import type {
  ChannelPlacementDiff,
  ChannelTypeDiff,
  DiscoveredCategory,
  DiscoveredChannel,
  GuildRoleRecord,
  PermissionOverwriteSnapshot,
  ProposedSetupChange,
  ResourceLifecycleState,
  ServerDiscoverySnapshot,
} from '../../../../packages/shared/src/types.ts';
import {
  LEGACY_CATEGORY_SPECS,
  LEGACY_CHANNEL_SPECS,
  LEGACY_ROLE_SPECS,
  OPTIONAL_EXTENSION_CHANNELS,
  type LegacyCategorySpec,
  type LegacyChannelSpec,
  type LegacyRoleSpec,
} from '../../../../packages/shared/src/legacy-template.ts';

export interface RoleLike {
  id: string;
  name: string;
  position: number;
  hexColor?: string;
  hoist?: boolean;
  mentionable: boolean;
  permissions?: { bitfield: bigint } | string;
}

export interface OverwriteLike {
  id: string;
  type: number; // 0 = role, 1 = member
  allow?: { toArray?: () => string[] } | string[];
  deny?: { toArray?: () => string[] } | string[];
}

export interface ChannelLike {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  rawPosition?: number;
  position?: number;
  topic?: string | null;
  permissionOverwrites?: {
    cache?: { values: () => Iterable<OverwriteLike> } | Map<string, OverwriteLike>;
  };
  isVoiceBased?: () => boolean;
}

export interface GuildLike {
  id: string;
  name: string;
  roles: {
    cache: { values: () => Iterable<RoleLike> } | Map<string, RoleLike>;
    fetch?: () => Promise<unknown>;
    create: (options: {
      name: string;
      color?: string | number;
      mentionable?: boolean;
      permissions?: bigint[];
      reason?: string;
    }) => Promise<RoleLike>;
  };
  channels: {
    cache: { values: () => Iterable<ChannelLike> } | Map<string, ChannelLike>;
    fetch?: () => Promise<unknown>;
    create: (options: {
      name: string;
      type: number;
      parent?: string | null;
      topic?: string;
      permissionOverwrites?: Array<{ id: string; allow?: bigint[]; deny?: bigint[] }>;
      reason?: string;
    }) => Promise<ChannelLike>;
  };
  members?: {
    me?: {
      roles?: { highest?: { position: number } };
      permissions?: { has: (perm: bigint) => boolean };
    } | null;
  };
}

export interface MatchResolution<T> {
  status: 'mapped' | 'conflicting' | 'missing';
  matched: T | null;
  candidates: { id: string; name: string }[];
  matchType: 'exact' | 'alias' | 'ambiguous' | 'none';
}

function normalizeStripEmoji(value: string): string {
  return value
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[—–・|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function iterateValues<T>(collection: { values: () => Iterable<T> } | Map<string, T>): T[] {
  return [...collection.values()];
}

function extractOverwrites(
  ch: ChannelLike,
  roleMap: Map<string, RoleLike>,
  guildId: string,
): PermissionOverwriteSnapshot[] {
  const cache = ch.permissionOverwrites?.cache;
  if (!cache) return [];
  const list = iterateValues(cache);
  return list.map((ow) => {
    const allow = (Array.isArray(ow.allow) ? ow.allow : ow.allow?.toArray?.() ?? []).map(String);
    const deny = (Array.isArray(ow.deny) ? ow.deny : ow.deny?.toArray?.() ?? []).map(String);
    const roleName = ow.type === 0 ? (ow.id === guildId ? '@everyone' : roleMap.get(ow.id)?.name ?? ow.id) : ow.id;
    return {
      targetId: ow.id,
      targetType: ow.type === 0 ? 'role' : 'member',
      targetName: roleName,
      allow,
      deny,
    };
  });
}

function mapChannelType(ch: ChannelLike): DiscoveredChannel['type'] {
  if (ch.isVoiceBased?.() || ch.type === ChannelType.GuildVoice) return 'voice';
  if (ch.type === ChannelType.GuildAnnouncement) return 'announcement';
  if (ch.type === ChannelType.GuildForum) return 'forum';
  return 'text';
}

function toDiscordChannelType(type: DiscoveredChannel['type']): number {
  switch (type) {
    case 'voice':
      return ChannelType.GuildVoice;
    case 'announcement':
      return ChannelType.GuildAnnouncement;
    case 'forum':
      return ChannelType.GuildForum;
    default:
      return ChannelType.GuildText;
  }
}

export function resolveRoleMatch(
  spec: Pick<LegacyRoleSpec, 'name' | 'aliases'>,
  existingRoles: RoleLike[],
): MatchResolution<RoleLike> {
  const nonEveryone = existingRoles.filter((r) => r.name !== '@everyone');
  const exactMatches = nonEveryone.filter((r) => r.name.trim().toLowerCase() === spec.name.trim().toLowerCase());
  if (exactMatches.length === 1) {
    return { status: 'mapped', matched: exactMatches[0], candidates: [{ id: exactMatches[0].id, name: exactMatches[0].name }], matchType: 'exact' };
  }
  if (exactMatches.length > 1) {
    return {
      status: 'conflicting',
      matched: null,
      candidates: exactMatches.map((r) => ({ id: r.id, name: r.name })),
      matchType: 'ambiguous',
    };
  }

  const aliasSet = new Set([spec.name, ...spec.aliases].map((a) => a.trim().toLowerCase()));
  const strippedSpec = normalizeStripEmoji(spec.name);
  const candidates = nonEveryone.filter((r) => {
    const raw = r.name.trim().toLowerCase();
    const stripped = normalizeStripEmoji(r.name);
    return aliasSet.has(raw) || aliasSet.has(stripped) || (strippedSpec.length > 0 && stripped === strippedSpec);
  });

  if (candidates.length === 1) {
    return {
      status: 'mapped',
      matched: candidates[0],
      candidates: [{ id: candidates[0].id, name: candidates[0].name }],
      matchType: 'alias',
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'conflicting',
      matched: null,
      candidates: candidates.map((r) => ({ id: r.id, name: r.name })),
      matchType: 'ambiguous',
    };
  }
  return { status: 'missing', matched: null, candidates: [], matchType: 'none' };
}

export function resolveCategoryMatch(
  spec: Pick<LegacyCategorySpec, 'name' | 'aliases'>,
  existingCategories: ChannelLike[],
): MatchResolution<ChannelLike> {
  const exact = existingCategories.filter((c) => c.name.trim().toLowerCase() === spec.name.trim().toLowerCase());
  if (exact.length === 1) {
    return { status: 'mapped', matched: exact[0], candidates: [{ id: exact[0].id, name: exact[0].name }], matchType: 'exact' };
  }
  if (exact.length > 1) {
    return { status: 'conflicting', matched: null, candidates: exact.map((c) => ({ id: c.id, name: c.name })), matchType: 'ambiguous' };
  }

  const aliasSet = new Set([spec.name, ...spec.aliases].map((a) => a.trim().toLowerCase()));
  const strippedSpec = normalizeStripEmoji(spec.name).replace(/^\d+\s*/, '').trim();
  const candidates = existingCategories.filter((c) => {
    const raw = c.name.trim().toLowerCase();
    const stripped = normalizeStripEmoji(c.name).replace(/^\d+\s*/, '').trim();
    return aliasSet.has(raw) || aliasSet.has(stripped) || (strippedSpec.length > 0 && stripped === strippedSpec);
  });

  if (candidates.length === 1) {
    return { status: 'mapped', matched: candidates[0], candidates: [{ id: candidates[0].id, name: candidates[0].name }], matchType: 'alias' };
  }
  if (candidates.length > 1) {
    return { status: 'conflicting', matched: null, candidates: candidates.map((c) => ({ id: c.id, name: c.name })), matchType: 'ambiguous' };
  }
  return { status: 'missing', matched: null, candidates: [], matchType: 'none' };
}

export function resolveChannelMatch(
  spec: Pick<LegacyChannelSpec, 'name' | 'aliases'>,
  channelsPool: ChannelLike[],
): MatchResolution<ChannelLike> {
  const exact = channelsPool.filter((c) => c.name.trim().toLowerCase() === spec.name.trim().toLowerCase());
  if (exact.length === 1) {
    return { status: 'mapped', matched: exact[0], candidates: [{ id: exact[0].id, name: exact[0].name }], matchType: 'exact' };
  }
  if (exact.length > 1) {
    return { status: 'conflicting', matched: null, candidates: exact.map((c) => ({ id: c.id, name: c.name })), matchType: 'ambiguous' };
  }

  const aliasSet = new Set([spec.name, ...spec.aliases].map((a) => a.trim().toLowerCase()));
  const strippedSpec = normalizeStripEmoji(spec.name);
  const candidates = channelsPool.filter((c) => {
    const raw = c.name.trim().toLowerCase();
    const stripped = normalizeStripEmoji(c.name);
    return aliasSet.has(raw) || aliasSet.has(stripped) || (strippedSpec.length > 0 && stripped === strippedSpec);
  });

  if (candidates.length === 1) {
    return { status: 'mapped', matched: candidates[0], candidates: [{ id: candidates[0].id, name: candidates[0].name }], matchType: 'alias' };
  }
  if (candidates.length > 1) {
    return { status: 'conflicting', matched: null, candidates: candidates.map((c) => ({ id: c.id, name: c.name })), matchType: 'ambiguous' };
  }
  return { status: 'missing', matched: null, candidates: [], matchType: 'none' };
}

/**
 * Discovers an existing Discord Guild non-destructively.
 * Inspects:
 * - existing & missing roles, role positions, role permissions
 * - existing & missing categories, existing & missing channels
 * - incorrect category placement (channels found outside expected parent category)
 * - incorrect channel types (e.g. text vs voice)
 * - duplicate / ambiguous candidates & uncategorized channels
 * - channel permission overwrites & permission policy diffs
 * Never deletes, renames, moves, or overwrites anything.
 */
export function discoverLiveDiscordGuild(
  discordGuild: GuildLike,
  existingSnapshot: ServerDiscoverySnapshot,
): ServerDiscoverySnapshot {
  const now = new Date().toISOString();
  const rawRoles = iterateValues(discordGuild.roles.cache);
  const roleMap = new Map<string, RoleLike>(rawRoles.map((r) => [r.id, r]));

  const rawChannels = iterateValues(discordGuild.channels.cache);
  const rawCategories = rawChannels
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0));
  const categoryNameById = new Map<string, string>(rawCategories.map((c) => [c.id, c.name]));

  const nonCategoryChannels = rawChannels.filter((c) => c.type !== ChannelType.GuildCategory);

  const matchedExistingRoleIds = new Set<string>();
  const roles: GuildRoleRecord[] = [];

  for (const spec of LEGACY_ROLE_SPECS) {
    const res = resolveRoleMatch(spec, rawRoles);
    if (res.status === 'mapped' && res.matched) {
      matchedExistingRoleIds.add(res.matched.id);
      roles.push({
        id: spec.key,
        discordRoleId: res.matched.id,
        name: res.matched.name,
        aliases: spec.aliases,
        category: spec.category,
        rankOrder: spec.rankOrder,
        position: res.matched.position,
        permissionsBitfield: typeof res.matched.permissions === 'string'
          ? res.matched.permissions
          : res.matched.permissions?.bitfield.toString() ?? '0',
        intendedPermissions: spec.intendedPermissions,
        colorHex: res.matched.hexColor && res.matched.hexColor !== '#000000' ? res.matched.hexColor : null,
        hoist: res.matched.hoist ?? null,
        selfAssignable: spec.selfAssignable,
        exclusiveGroupId: spec.exclusiveGroupId,
        discoveredFromExisting: true,
        mapped: true,
        mentionable: res.matched.mentionable,
        excludeFromAutoSetup: spec.excludeFromAutoSetup,
        requiresAdminReview: spec.requiresAdminReview,
        unknownLegacyProperties: spec.unknownLegacyProperties,
        lifecycleState: 'mapped',
      });
    } else if (res.status === 'conflicting') {
      roles.push({
        id: spec.key,
        discordRoleId: null,
        name: spec.name,
        aliases: spec.aliases,
        category: spec.category,
        rankOrder: spec.rankOrder,
        position: 0,
        permissionsBitfield: '0',
        intendedPermissions: spec.intendedPermissions,
        colorHex: null,
        hoist: null,
        selfAssignable: spec.selfAssignable,
        exclusiveGroupId: spec.exclusiveGroupId,
        discoveredFromExisting: false,
        mapped: false,
        mentionable: spec.mentionable,
        excludeFromAutoSetup: spec.excludeFromAutoSetup,
        requiresAdminReview: spec.requiresAdminReview,
        unknownLegacyProperties: spec.unknownLegacyProperties,
        lifecycleState: 'conflicting',
        conflictCandidates: res.candidates,
      });
    } else {
      roles.push({
        id: spec.key,
        discordRoleId: null,
        name: spec.name,
        aliases: spec.aliases,
        category: spec.category,
        rankOrder: spec.rankOrder,
        position: 0,
        permissionsBitfield: '0',
        intendedPermissions: spec.intendedPermissions,
        colorHex: null,
        hoist: null,
        selfAssignable: spec.selfAssignable,
        exclusiveGroupId: spec.exclusiveGroupId,
        discoveredFromExisting: false,
        mapped: false,
        mentionable: spec.mentionable,
        excludeFromAutoSetup: spec.excludeFromAutoSetup,
        requiresAdminReview: spec.requiresAdminReview,
        unknownLegacyProperties: spec.unknownLegacyProperties,
        lifecycleState: spec.excludeFromAutoSetup ? 'requires_manual_setup' : 'missing',
      });
    }
  }

  for (const extra of rawRoles) {
    if (extra.name === '@everyone' || matchedExistingRoleIds.has(extra.id)) continue;
    roles.push({
      id: `role-${extra.id}`,
      discordRoleId: extra.id,
      name: extra.name,
      aliases: [],
      category: 'notification',
      rankOrder: 0,
      position: extra.position,
      permissionsBitfield: typeof extra.permissions === 'string'
        ? extra.permissions
        : extra.permissions?.bitfield.toString() ?? '0',
      intendedPermissions: [],
      colorHex: extra.hexColor && extra.hexColor !== '#000000' ? extra.hexColor : null,
      hoist: extra.hoist ?? null,
      selfAssignable: false,
      exclusiveGroupId: null,
      discoveredFromExisting: true,
      mapped: false,
      mentionable: extra.mentionable,
      lifecycleState: 'discovered',
    });
  }

  const matchedExistingCatIds = new Set<string>();
  const matchedExistingChIds = new Set<string>();
  const categories: DiscoveredCategory[] = [];
  const incorrectPlacements: ChannelPlacementDiff[] = [];
  const incorrectTypes: ChannelTypeDiff[] = [];

  // First pass: resolve categories
  const resolvedCategoryByKey = new Map<string, ChannelLike | null>();
  const categoryStateByKey = new Map<string, MatchResolution<ChannelLike>>();
  for (const catSpec of LEGACY_CATEGORY_SPECS) {
    const catRes = resolveCategoryMatch(catSpec, rawCategories);
    categoryStateByKey.set(catSpec.key, catRes);
    if (catRes.status === 'mapped' && catRes.matched) {
      matchedExistingCatIds.add(catRes.matched.id);
      resolvedCategoryByKey.set(catSpec.key, catRes.matched);
    } else {
      resolvedCategoryByKey.set(catSpec.key, null);
    }
  }

  // Second pass: resolve channels, preferring expected category first, then checking whole guild for misplacement
  for (const catSpec of LEGACY_CATEGORY_SPECS) {
    const catRes = categoryStateByKey.get(catSpec.key)!;
    const existingCat = resolvedCategoryByKey.get(catSpec.key) ?? null;
    const catChannelsSpec = LEGACY_CHANNEL_SPECS.filter((ch) => ch.categoryName === catSpec.name);
    const childRawChannels = existingCat
      ? nonCategoryChannels.filter((ch) => ch.parentId === existingCat.id)
      : [];

    const mappedChannels: DiscoveredChannel[] = [];

    for (const chSpec of catChannelsSpec) {
      let chRes: MatchResolution<ChannelLike> = existingCat
        ? resolveChannelMatch(chSpec, childRawChannels)
        : { status: 'missing', matched: null, candidates: [], matchType: 'none' };

      let misplacedCategory = false;
      let actualParentName: string | null = existingCat ? existingCat.name : null;

      // Check guild-wide if not found inside expected parent category
      if (chRes.status === 'missing') {
        const guildWide = resolveChannelMatch(chSpec, nonCategoryChannels);
        if (guildWide.status === 'mapped' && guildWide.matched) {
          chRes = guildWide;
          misplacedCategory = true;
          actualParentName = guildWide.matched.parentId
            ? categoryNameById.get(guildWide.matched.parentId) ?? 'Unknown Category'
            : null;
          incorrectPlacements.push({
            channelName: guildWide.matched.name,
            discordChannelId: guildWide.matched.id,
            expectedCategoryName: catSpec.name,
            actualCategoryName: actualParentName,
          });
        } else if (guildWide.status === 'conflicting') {
          chRes = guildWide;
        }
      }

      if (chRes.status === 'mapped' && chRes.matched) {
        matchedExistingChIds.add(chRes.matched.id);
        const actualType = mapChannelType(chRes.matched);
        const typeMismatch = actualType !== chSpec.type;
        if (typeMismatch) {
          incorrectTypes.push({
            channelName: chRes.matched.name,
            discordChannelId: chRes.matched.id,
            expectedType: chSpec.type,
            actualType,
          });
        }

        mappedChannels.push({
          id: chSpec.key,
          discordChannelId: chRes.matched.id,
          name: chRes.matched.name,
          type: actualType,
          expectedType: chSpec.type,
          categoryId: catSpec.key,
          expectedCategoryId: catSpec.key,
          actualParentCategoryName: actualParentName,
          topic: chRes.matched.topic ?? chSpec.topic,
          isPrivateLeadership: catSpec.isPrivateLeadership,
          readOnlyForMembers: chSpec.readOnlyForMembers,
          accessClassification: chSpec.accessClassification,
          languageCode: chSpec.languageCode,
          mappedRolePurpose: chSpec.key,
          discoveredFromExisting: true,
          required: chSpec.required,
          misplacedCategory,
          typeMismatch,
          permissionOverwrites: extractOverwrites(chRes.matched, roleMap, discordGuild.id),
          lifecycleState: misplacedCategory || typeMismatch ? 'requires_manual_setup' : 'mapped',
        });
      } else if (chRes.status === 'conflicting') {
        mappedChannels.push({
          id: chSpec.key,
          discordChannelId: null,
          name: chSpec.name,
          type: chSpec.type,
          expectedType: chSpec.type,
          categoryId: catSpec.key,
          expectedCategoryId: catSpec.key,
          topic: chSpec.topic,
          isPrivateLeadership: catSpec.isPrivateLeadership,
          readOnlyForMembers: chSpec.readOnlyForMembers,
          accessClassification: chSpec.accessClassification,
          languageCode: chSpec.languageCode,
          mappedRolePurpose: chSpec.key,
          discoveredFromExisting: false,
          required: chSpec.required,
          permissionOverwrites: [],
          lifecycleState: 'conflicting',
          conflictCandidates: chRes.candidates,
        });
      } else {
        mappedChannels.push({
          id: chSpec.key,
          discordChannelId: null,
          name: chSpec.name,
          type: chSpec.type,
          expectedType: chSpec.type,
          categoryId: catSpec.key,
          expectedCategoryId: catSpec.key,
          topic: chSpec.topic,
          isPrivateLeadership: catSpec.isPrivateLeadership,
          readOnlyForMembers: chSpec.readOnlyForMembers,
          accessClassification: chSpec.accessClassification,
          languageCode: chSpec.languageCode,
          mappedRolePurpose: chSpec.key,
          discoveredFromExisting: false,
          required: chSpec.required,
          permissionOverwrites: [],
          lifecycleState: 'missing',
        });
      }
    }

    if (existingCat) {
      for (const extraCh of childRawChannels) {
        if (matchedExistingChIds.has(extraCh.id)) continue;
        mappedChannels.push({
          id: `ch-${extraCh.id}`,
          discordChannelId: extraCh.id,
          name: extraCh.name,
          type: mapChannelType(extraCh),
          categoryId: catSpec.key,
          topic: extraCh.topic ?? '',
          isPrivateLeadership: catSpec.isPrivateLeadership,
          readOnlyForMembers: false,
          accessClassification: catSpec.isPrivateLeadership ? 'leadership_only' : 'verified_member',
          languageCode: null,
          mappedRolePurpose: null,
          discoveredFromExisting: true,
          required: false,
          permissionOverwrites: extractOverwrites(extraCh, roleMap, discordGuild.id),
          lifecycleState: 'discovered',
        });
      }

      categories.push({
        id: catSpec.key,
        discordCategoryId: existingCat.id,
        name: existingCat.name,
        position: existingCat.rawPosition ?? existingCat.position ?? catSpec.position,
        isPrivateLeadership: catSpec.isPrivateLeadership,
        discoveredFromExisting: true,
        lifecycleState: 'mapped',
        permissionOverwrites: extractOverwrites(existingCat, roleMap, discordGuild.id),
        channels: mappedChannels,
      });
    } else {
      const catState: ResourceLifecycleState = catRes.status === 'conflicting' ? 'conflicting' : 'missing';
      categories.push({
        id: catSpec.key,
        discordCategoryId: null,
        name: catSpec.name,
        position: catSpec.position,
        isPrivateLeadership: catSpec.isPrivateLeadership,
        discoveredFromExisting: false,
        lifecycleState: catState,
        permissionOverwrites: [],
        conflictCandidates: catRes.status === 'conflicting' ? catRes.candidates : undefined,
        channels: mappedChannels,
      });
    }
  }

  for (const extraCat of rawCategories) {
    if (matchedExistingCatIds.has(extraCat.id)) continue;
    const childRawChannels = nonCategoryChannels.filter((ch) => ch.parentId === extraCat.id);
    categories.push({
      id: `cat-${extraCat.id}`,
      discordCategoryId: extraCat.id,
      name: extraCat.name,
      position: extraCat.rawPosition ?? extraCat.position ?? 99,
      isPrivateLeadership: extraCat.name.toLowerCase().includes('sanctum'),
      discoveredFromExisting: true,
      lifecycleState: 'discovered',
      permissionOverwrites: extractOverwrites(extraCat, roleMap, discordGuild.id),
      channels: childRawChannels.map((ch) => ({
        id: `ch-${ch.id}`,
        discordChannelId: ch.id,
        name: ch.name,
        type: mapChannelType(ch),
        categoryId: `cat-${extraCat.id}`,
        topic: ch.topic ?? '',
        isPrivateLeadership: extraCat.name.toLowerCase().includes('sanctum'),
        readOnlyForMembers: false,
        accessClassification: 'verified_member',
        languageCode: null,
        mappedRolePurpose: null,
        discoveredFromExisting: true,
        required: false,
        permissionOverwrites: extractOverwrites(ch, roleMap, discordGuild.id),
        lifecycleState: 'discovered',
      })),
    });
  }

  const uncategorizedChannels: DiscoveredChannel[] = nonCategoryChannels
    .filter((ch) => !ch.parentId)
    .map((ch) => ({
      id: `ch-${ch.id}`,
      discordChannelId: ch.id,
      name: ch.name,
      type: mapChannelType(ch),
      categoryId: null,
      topic: ch.topic ?? '',
      isPrivateLeadership: false,
      readOnlyForMembers: false,
      accessClassification: 'verified_member',
      languageCode: null,
      mappedRolePurpose: null,
      discoveredFromExisting: true,
      required: false,
      permissionOverwrites: extractOverwrites(ch, roleMap, discordGuild.id),
      lifecycleState: 'discovered',
    }));

  const optionalChannels: DiscoveredChannel[] = OPTIONAL_EXTENSION_CHANNELS.map((ext) => {
    const matched = resolveChannelMatch(ext, nonCategoryChannels);
    return {
      id: ext.key,
      discordChannelId: matched.matched?.id ?? null,
      name: matched.matched?.name ?? ext.name,
      type: matched.matched ? mapChannelType(matched.matched) : ext.type,
      categoryId: ext.categoryName,
      topic: ext.topic,
      isPrivateLeadership: ext.accessClassification === 'leadership_only',
      readOnlyForMembers: ext.readOnlyForMembers,
      accessClassification: ext.accessClassification,
      languageCode: ext.languageCode,
      mappedRolePurpose: ext.key,
      discoveredFromExisting: Boolean(matched.matched),
      required: false,
      permissionOverwrites: matched.matched ? extractOverwrites(matched.matched, roleMap, discordGuild.id) : [],
      lifecycleState: matched.matched ? 'mapped' : 'proposed',
    };
  });

  const permissionDifferences = auditGuildPermissions(categories, roles, discordGuild.id);
  const proposedChanges = computeNonDestructiveDiff(
    categories,
    roles,
    incorrectPlacements,
    incorrectTypes,
    permissionDifferences,
  );
  const conflictsCount = proposedChanges.filter((c) => c.status === 'conflicting').length;
  const missingCount = proposedChanges.filter(
    (c) => c.status === 'proposed' || c.status === 'missing' || c.status === 'requires_manual_setup',
  ).length;

  return {
    guildId: existingSnapshot.guildId,
    guildName: discordGuild.name,
    lastDiscoveredAt: now,
    categories,
    uncategorizedChannels,
    optionalChannels,
    roles,
    incorrectPlacements,
    incorrectTypes,
    permissionDifferences,
    proposedChanges,
    conflictsCount,
    missingCount,
    setupConfirmedBy: existingSnapshot.setupConfirmedBy,
    setupConfirmedAt: existingSnapshot.setupConfirmedAt,
  };
}

export function computeNonDestructiveDiff(
  categories: DiscoveredCategory[],
  roles: GuildRoleRecord[],
  incorrectPlacements: ChannelPlacementDiff[] = [],
  incorrectTypes: ChannelTypeDiff[] = [],
  permissionDifferences: ServerDiscoverySnapshot['permissionDifferences'] = [],
): ProposedSetupChange[] {
  const changes: ProposedSetupChange[] = [];

  for (const roleSpec of LEGACY_ROLE_SPECS) {
    const rec = roles.find((r) => r.id === roleSpec.key);
    if (!rec || rec.lifecycleState === 'missing' || rec.lifecycleState === 'requires_manual_setup') {
      if (roleSpec.excludeFromAutoSetup) {
        changes.push({
          id: `manual-role-${roleSpec.key}`,
          kind: 'manual_review_required',
          targetName: roleSpec.name,
          reason: 'Excluded from automatic creation per legacy safety policy; top leadership role must be created/assigned manually by the server owner.',
          nonDestructive: true,
          status: 'requires_manual_setup',
          verifiedDiscordId: null,
          error: null,
        });
      } else {
        changes.push({
          id: `create-role-${roleSpec.key}`,
          kind: 'create_role',
          targetName: roleSpec.name,
          reason: 'Missing expected legacy role; will be created additively with safe zeroed permissions (never auto-grants Administrator; color/hoist require admin review).',
          nonDestructive: true,
          status: 'proposed',
          verifiedDiscordId: null,
          error: null,
        });
      }
    } else if (rec.lifecycleState === 'conflicting') {
      changes.push({
        id: `conflict-role-${roleSpec.key}`,
        kind: 'resolve_conflict',
        targetName: roleSpec.name,
        reason: `Multiple role candidates matched (${rec.conflictCandidates?.map((c) => c.name).join(', ')}). Administrator resolution required; auto-selection blocked.`,
        nonDestructive: true,
        status: 'conflicting',
        verifiedDiscordId: null,
        error: null,
      });
    } else {
      changes.push({
        id: `map-role-${roleSpec.key}`,
        kind: 'map_existing_role',
        targetName: rec.name,
        reason: `Existing Discord role mapped cleanly (pos=${rec.position}, perms=${rec.permissionsBitfield}); name, ID, color, and permissions preserved.`,
        nonDestructive: true,
        status: 'mapped',
        verifiedDiscordId: rec.discordRoleId,
        error: null,
      });
    }
  }

  for (const catSpec of LEGACY_CATEGORY_SPECS) {
    const cat = categories.find((c) => c.id === catSpec.key);
    if (!cat || cat.lifecycleState === 'missing') {
      changes.push({
        id: `create-cat-${catSpec.key}`,
        kind: 'create_category',
        targetName: catSpec.name,
        reason: 'Missing legacy category; requires explicit admin confirmation to create additively.',
        nonDestructive: true,
        status: 'proposed',
        verifiedDiscordId: null,
        error: null,
      });
    } else if (cat.lifecycleState === 'conflicting') {
      changes.push({
        id: `conflict-cat-${catSpec.key}`,
        kind: 'resolve_conflict',
        targetName: catSpec.name,
        reason: `Multiple category candidates matched (${cat.conflictCandidates?.map((c) => c.name).join(', ')}). Administrator resolution required.`,
        nonDestructive: true,
        status: 'conflicting',
        verifiedDiscordId: null,
        error: null,
      });
    } else {
      changes.push({
        id: `map-cat-${catSpec.key}`,
        kind: 'map_existing_category',
        targetName: cat.name,
        reason: `Existing category mapped without altering structure (${cat.permissionOverwrites.length} permission overwrite(s) preserved).`,
        nonDestructive: true,
        status: 'mapped',
        verifiedDiscordId: cat.discordCategoryId,
        error: null,
      });
    }

    const catChannels = cat?.channels ?? [];
    for (const chSpec of LEGACY_CHANNEL_SPECS.filter((c) => c.categoryName === catSpec.name)) {
      const ch = catChannels.find((c) => c.id === chSpec.key);
      if (!ch || ch.lifecycleState === 'missing') {
        changes.push({
          id: `create-ch-${chSpec.key}`,
          kind: 'create_channel',
          targetName: chSpec.name,
          parentCategoryName: catSpec.name,
          reason: `Missing ${chSpec.type} channel under ${catSpec.name}; will be created additively on confirmation.`,
          nonDestructive: true,
          status: 'proposed',
          verifiedDiscordId: null,
          error: null,
        });
      } else if (ch.lifecycleState === 'conflicting') {
        changes.push({
          id: `conflict-ch-${chSpec.key}`,
          kind: 'resolve_conflict',
          targetName: chSpec.name,
          parentCategoryName: catSpec.name,
          reason: `Multiple channel candidates matched (${ch.conflictCandidates?.map((c) => c.name).join(', ')}); administrator resolution required.`,
          nonDestructive: true,
          status: 'conflicting',
          verifiedDiscordId: null,
          error: null,
        });
      } else if (ch.misplacedCategory || ch.typeMismatch) {
        if (ch.misplacedCategory) {
          changes.push({
            id: `misplaced-ch-${chSpec.key}`,
            kind: 'incorrect_category_placement',
            targetName: ch.name,
            parentCategoryName: catSpec.name,
            reason: `Channel exists under "${ch.actualParentCategoryName ?? 'Uncategorized'}" instead of "${catSpec.name}". Setup will NOT move or duplicate it automatically; move manually if desired.`,
            nonDestructive: true,
            status: 'requires_manual_setup',
            verifiedDiscordId: ch.discordChannelId,
            error: null,
          });
        }
        if (ch.typeMismatch) {
          changes.push({
            id: `typemismatch-ch-${chSpec.key}`,
            kind: 'incorrect_channel_type',
            targetName: ch.name,
            parentCategoryName: catSpec.name,
            reason: `Existing channel type is "${ch.type}" but legacy spec expects "${ch.expectedType}". Setup will NOT delete or recreate it.`,
            nonDestructive: true,
            status: 'requires_manual_setup',
            verifiedDiscordId: ch.discordChannelId,
            error: null,
          });
        }
      } else {
        changes.push({
          id: `map-ch-${chSpec.key}`,
          kind: 'map_existing_channel',
          targetName: ch.name,
          parentCategoryName: cat?.name ?? catSpec.name,
          reason: `Existing ${ch.type} channel mapped cleanly (${ch.permissionOverwrites.length} overwrite(s) preserved).`,
          nonDestructive: true,
          status: 'mapped',
          verifiedDiscordId: ch.discordChannelId,
          error: null,
        });
      }
    }
  }

  for (const placement of incorrectPlacements) {
    const id = `placement-warn-${placement.discordChannelId}`;
    if (!changes.some((c) => c.verifiedDiscordId === placement.discordChannelId && c.kind === 'incorrect_category_placement')) {
      changes.push({
        id,
        kind: 'incorrect_category_placement',
        targetName: placement.channelName,
        parentCategoryName: placement.expectedCategoryName,
        reason: `Located in "${placement.actualCategoryName ?? 'Uncategorized'}" instead of "${placement.expectedCategoryName}".`,
        nonDestructive: true,
        status: 'requires_manual_setup',
        verifiedDiscordId: placement.discordChannelId,
        error: null,
      });
    }
  }

  for (const tdiff of incorrectTypes) {
    const id = `type-warn-${tdiff.discordChannelId}`;
    if (!changes.some((c) => c.verifiedDiscordId === tdiff.discordChannelId && c.kind === 'incorrect_channel_type')) {
      changes.push({
        id,
        kind: 'incorrect_channel_type',
        targetName: tdiff.channelName,
        reason: `Actual type "${tdiff.actualType}" differs from legacy expected type "${tdiff.expectedType}".`,
        nonDestructive: true,
        status: 'requires_manual_setup',
        verifiedDiscordId: tdiff.discordChannelId,
        error: null,
      });
    }
  }

  for (const finding of permissionDifferences) {
    changes.push({
      id: `permdiff-${finding.id}`,
      kind: 'permission_diff',
      targetName: finding.targetName,
      reason: `[${finding.severity.toUpperCase()}] ${finding.summary} Expected: ${finding.expectedPolicy} (Setup never overwrites existing permissions automatically.)`,
      nonDestructive: true,
      status: 'requires_manual_setup',
      verifiedDiscordId: null,
      error: null,
    });
  }

  return changes;
}

export interface SetupExecutionOptions {
  mode: 'missing_only' | 'full_setup';
  actorUsername: string;
}

export interface SetupExecutionReport {
  snapshot: ServerDiscoverySnapshot;
  appliedCount: number;
  failedCount: number;
  skippedConflicts: number;
  skippedManualItems: string[];
  failures: { targetName: string; error: string }[];
}

/**
 * Executes additive, non-destructive setup against a live (or mocked) Discord Guild.
 * - Never deletes, renames, moves, or overwrites permissions on existing resources.
 * - Never auto-creates `👑 Shadow King` (`excludeFromAutoSetup: true`).
 * - Never grants Administrator or privileged Discord permissions automatically.
 * - Never invents legacy role colors (`color` omitted when `spec.colorHex` is `null`).
 * - Marks `status = 'applied'` ONLY after receiving a verified Discord resource ID.
 */
export async function executeAdditiveSetupOnDiscordGuild(
  discordGuild: GuildLike,
  currentSnapshot: ServerDiscoverySnapshot,
  options: SetupExecutionOptions,
): Promise<SetupExecutionReport> {
  await discordGuild.roles.fetch?.();
  await discordGuild.channels.fetch?.();

  let working = discoverLiveDiscordGuild(discordGuild, currentSnapshot);
  const failures: { targetName: string; error: string }[] = [];
  let appliedCount = 0;
  let skippedConflicts = 0;
  const skippedManualItems: string[] = [];

  const roleIdByName = new Map<string, string>();
  for (const r of iterateValues(discordGuild.roles.cache)) {
    roleIdByName.set(r.name, r.id);
  }

  const categoryIdByKey = new Map<string, string>();
  for (const c of working.categories) {
    if (c.discordCategoryId) categoryIdByKey.set(c.id, c.discordCategoryId);
  }

  const updatedChanges = working.proposedChanges.map((c) => ({ ...c }));

  // Step 1: Create missing eligible roles (never create excluded roles like 👑 Shadow King, never grant Administrator)
  for (const change of updatedChanges) {
    if (change.kind === 'resolve_conflict') {
      skippedConflicts += 1;
      continue;
    }
    if (
      change.kind === 'manual_review_required' ||
      change.kind === 'incorrect_category_placement' ||
      change.kind === 'incorrect_channel_type' ||
      change.kind === 'permission_diff'
    ) {
      skippedManualItems.push(change.targetName);
      continue;
    }
    if (change.kind !== 'create_role') continue;
    if (change.status !== 'proposed' && change.status !== 'confirmed' && change.status !== 'failed') continue;

    const spec = LEGACY_ROLE_SPECS.find((r) => r.name === change.targetName);
    if (!spec) continue;
    if (spec.excludeFromAutoSetup) {
      change.status = 'requires_manual_setup';
      skippedManualItems.push(spec.name);
      continue;
    }

    const currentRoles = iterateValues(discordGuild.roles.cache);
    const recheck = resolveRoleMatch(spec, currentRoles);
    if (recheck.status === 'mapped' && recheck.matched) {
      change.status = 'mapped';
      change.verifiedDiscordId = recheck.matched.id;
      roleIdByName.set(spec.name, recheck.matched.id);
      continue;
    }
    if (recheck.status === 'conflicting') {
      change.status = 'conflicting';
      skippedConflicts += 1;
      continue;
    }

    change.status = 'applying';
    try {
      const createdRole = await discordGuild.roles.create({
        name: spec.name,
        ...(spec.colorHex ? { color: spec.colorHex } : {}),
        mentionable: spec.mentionable,
        permissions: [], // Never grant Administrator or elevated permissions automatically
        reason: `ShadowSlayers non-destructive setup (${options.mode}) by ${options.actorUsername}`,
      });
      if (!createdRole?.id) {
        throw new Error('Discord API did not return a verified role ID.');
      }
      change.status = 'applied';
      change.verifiedDiscordId = createdRole.id;
      change.error = null;
      roleIdByName.set(spec.name, createdRole.id);
      appliedCount += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      change.status = 'failed';
      change.error = message;
      failures.push({ targetName: spec.name, error: message });
    }
  }

  // Step 2: Create missing categories
  const verifiedRoleId = roleIdByName.get('✅ Verified');
  const clanRankRoleIds = ['👑 Shadow King', '🛡️ Shadow Council', '⚔️ Warlord', '🔥 Elite Warrior', '🖤 ShadowSlayer', '🌱 Recruit']
    .map((n) => roleIdByName.get(n))
    .filter((id): id is string => Boolean(id));
  const leadershipRoleIds = ['👑 Shadow King', '🛡️ Shadow Council', '⚔️ Warlord']
    .map((n) => roleIdByName.get(n))
    .filter((id): id is string => Boolean(id));

  for (const change of updatedChanges) {
    if (change.kind !== 'create_category') continue;
    if (change.status !== 'proposed' && change.status !== 'confirmed' && change.status !== 'failed') continue;

    const catSpec = LEGACY_CATEGORY_SPECS.find((c) => c.name === change.targetName);
    if (!catSpec) continue;

    const currentCats = iterateValues(discordGuild.channels.cache).filter((c) => c.type === ChannelType.GuildCategory);
    const recheck = resolveCategoryMatch(catSpec, currentCats);
    if (recheck.status === 'mapped' && recheck.matched) {
      change.status = 'mapped';
      change.verifiedDiscordId = recheck.matched.id;
      categoryIdByKey.set(catSpec.key, recheck.matched.id);
      continue;
    }
    if (recheck.status === 'conflicting') {
      change.status = 'conflicting';
      skippedConflicts += 1;
      continue;
    }

    change.status = 'applying';
    try {
      const overwrites: Array<{ id: string; allow?: bigint[]; deny?: bigint[] }> = [];
      if (catSpec.key !== 'cat_01_gate') {
        overwrites.push({ id: discordGuild.id, deny: [PermissionFlagsBits.ViewChannel] });
        if (catSpec.isPrivateLeadership) {
          for (const lid of leadershipRoleIds) {
            overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
          }
        } else if (catSpec.key === 'cat_06_shadowslayers' || catSpec.key === 'cat_09_clan_voice') {
          for (const cid of clanRankRoleIds) {
            overwrites.push({ id: cid, allow: [PermissionFlagsBits.ViewChannel] });
          }
        } else if (verifiedRoleId && catSpec.key !== 'cat_05_class_halls') {
          overwrites.push({ id: verifiedRoleId, allow: [PermissionFlagsBits.ViewChannel] });
        } else if (catSpec.key === 'cat_05_class_halls') {
          for (const lid of leadershipRoleIds) {
            overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel] });
          }
        }
      }

      const createdCat = await discordGuild.channels.create({
        name: catSpec.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwrites,
        reason: `ShadowSlayers non-destructive setup (${options.mode}) by ${options.actorUsername}`,
      });
      if (!createdCat?.id) {
        throw new Error('Discord API did not return a verified category ID.');
      }
      change.status = 'applied';
      change.verifiedDiscordId = createdCat.id;
      change.error = null;
      categoryIdByKey.set(catSpec.key, createdCat.id);
      appliedCount += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      change.status = 'failed';
      change.error = message;
      failures.push({ targetName: catSpec.name, error: message });
    }
  }

  // Step 3: Create missing channels (skip misplaced/conflicting channels so we never duplicate)
  for (const change of updatedChanges) {
    if (change.kind !== 'create_channel') continue;
    if (change.status !== 'proposed' && change.status !== 'confirmed' && change.status !== 'failed') continue;

    const chSpec = LEGACY_CHANNEL_SPECS.find(
      (c) => c.name === change.targetName && (!change.parentCategoryName || c.categoryName === change.parentCategoryName),
    );
    if (!chSpec) continue;
    if (options.mode === 'missing_only' && !chSpec.required) continue;

    const catSpec = LEGACY_CATEGORY_SPECS.find((c) => c.name === chSpec.categoryName);
    const parentId = catSpec ? categoryIdByKey.get(catSpec.key) ?? null : null;
    if (!parentId) {
      change.status = 'failed';
      change.error = `Parent category "${chSpec.categoryName}" does not exist or failed creation.`;
      failures.push({ targetName: chSpec.name, error: change.error });
      continue;
    }

    const allNonCat = iterateValues(discordGuild.channels.cache).filter((c) => c.type !== ChannelType.GuildCategory);
    const recheck = resolveChannelMatch(chSpec, allNonCat);
    if (recheck.status === 'mapped' && recheck.matched) {
      change.status = 'mapped';
      change.verifiedDiscordId = recheck.matched.id;
      continue;
    }
    if (recheck.status === 'conflicting') {
      change.status = 'conflicting';
      skippedConflicts += 1;
      continue;
    }

    change.status = 'applying';
    try {
      const overwrites: Array<{ id: string; allow?: bigint[]; deny?: bigint[] }> = [];
      if (chSpec.accessClassification === 'public_onboarding') {
        if (chSpec.readOnlyForMembers) {
          overwrites.push({ id: discordGuild.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
          for (const lid of leadershipRoleIds) {
            overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
          }
        }
      } else if (chSpec.accessClassification === 'verified_member' && chSpec.categoryName === '📜 01 — GATE OF SHADOWS') {
        overwrites.push({
          id: discordGuild.id,
          deny: chSpec.readOnlyForMembers
            ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            : [PermissionFlagsBits.ViewChannel],
        });
        if (verifiedRoleId) {
          overwrites.push({ id: verifiedRoleId, allow: [PermissionFlagsBits.ViewChannel] });
        }
        for (const lid of leadershipRoleIds) {
          overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
        }
      } else if (chSpec.accessClassification === 'class_hall') {
        overwrites.push({ id: discordGuild.id, deny: [PermissionFlagsBits.ViewChannel] });
        const classRoleName =
          chSpec.key === 'ch_hall_warrior'
            ? '⚔️ Warrior'
            : chSpec.key === 'ch_hall_sorcerer'
              ? '🔮 Sorcerer'
              : '🗡️ Swordsman';
        const classRoleId = roleIdByName.get(classRoleName);
        if (classRoleId) overwrites.push({ id: classRoleId, allow: [PermissionFlagsBits.ViewChannel] });
        for (const lid of leadershipRoleIds) overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel] });
      } else if (chSpec.accessClassification === 'leadership_only') {
        overwrites.push({ id: discordGuild.id, deny: [PermissionFlagsBits.ViewChannel] });
        for (const lid of leadershipRoleIds) {
          overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
        }
      } else if (chSpec.readOnlyForMembers) {
        overwrites.push({ id: discordGuild.id, deny: [PermissionFlagsBits.SendMessages] });
        for (const lid of leadershipRoleIds) {
          overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
        }
      }

      const createdCh = await discordGuild.channels.create({
        name: chSpec.name,
        type: toDiscordChannelType(chSpec.type),
        parent: parentId,
        topic: chSpec.topic,
        permissionOverwrites: overwrites.length > 0 ? overwrites : undefined,
        reason: `ShadowSlayers non-destructive setup (${options.mode}) by ${options.actorUsername}`,
      });
      if (!createdCh?.id) {
        throw new Error('Discord API did not return a verified channel ID.');
      }
      change.status = 'applied';
      change.verifiedDiscordId = createdCh.id;
      change.error = null;
      appliedCount += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      change.status = 'failed';
      change.error = message;
      failures.push({ targetName: chSpec.name, error: message });
    }
  }

  const rescanned = discoverLiveDiscordGuild(discordGuild, {
    ...currentSnapshot,
    setupConfirmedBy: options.actorUsername,
    setupConfirmedAt: new Date().toISOString(),
  });

  const resultMap = new Map(updatedChanges.map((c) => [c.id, c]));
  rescanned.proposedChanges = rescanned.proposedChanges.map((c) => {
    const executed = resultMap.get(c.id);
    if (!executed) return c;
    if (executed.status === 'applied' || executed.status === 'failed') {
      return {
        ...c,
        status: executed.status,
        verifiedDiscordId: executed.verifiedDiscordId,
        error: executed.error,
      };
    }
    return c;
  });

  working = rescanned;

  return {
    snapshot: working,
    appliedCount,
    failedCount: failures.length,
    skippedConflicts,
    skippedManualItems,
    failures,
  };
}
