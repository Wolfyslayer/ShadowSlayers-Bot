import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type {
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
  type LegacyCategorySpec,
  type LegacyChannelSpec,
  type LegacyRoleSpec,
} from '../../../../packages/shared/src/legacy-template.ts';

export interface RoleLike {
  id: string;
  name: string;
  position: number;
  hexColor?: string;
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
): PermissionOverwriteSnapshot[] {
  const cache = ch.permissionOverwrites?.cache;
  if (!cache) return [];
  const list = iterateValues(cache);
  return list.map((ow) => {
    const allow = Array.isArray(ow.allow) ? ow.allow : ow.allow?.toArray?.() ?? [];
    const deny = Array.isArray(ow.deny) ? ow.deny : ow.deny?.toArray?.() ?? [];
    const roleName = ow.type === 0 ? roleMap.get(ow.id)?.name ?? (ow.id === ch.id ? '@everyone' : ow.id) : ow.id;
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

/**
 * Resolves an expected legacy role against existing guild roles using:
 * 1. Exact name match (including emoji)
 * 2. Controlled alias match (never renames existing role)
 * 3. Rejects auto-selection when multiple alias/fuzzy candidates exist -> 'conflicting'
 */
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
  categoryChannels: ChannelLike[],
): MatchResolution<ChannelLike> {
  const exact = categoryChannels.filter((c) => c.name.trim().toLowerCase() === spec.name.trim().toLowerCase());
  if (exact.length === 1) {
    return { status: 'mapped', matched: exact[0], candidates: [{ id: exact[0].id, name: exact[0].name }], matchType: 'exact' };
  }
  if (exact.length > 1) {
    return { status: 'conflicting', matched: null, candidates: exact.map((c) => ({ id: c.id, name: c.name })), matchType: 'ambiguous' };
  }

  const aliasSet = new Set([spec.name, ...spec.aliases].map((a) => a.trim().toLowerCase()));
  const strippedSpec = normalizeStripEmoji(spec.name);
  const candidates = categoryChannels.filter((c) => {
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
 * Never deletes roles, never renames roles, and never overwrites permissions.
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

  const nonCategoryChannels = rawChannels.filter((c) => c.type !== ChannelType.GuildCategory);

  // Build role records preserving ALL existing roles and recording mapping status
  const matchedExistingRoleIds = new Set<string>();
  const roles: GuildRoleRecord[] = [];

  for (const spec of LEGACY_ROLE_SPECS) {
    const res = resolveRoleMatch(spec, rawRoles);
    if (res.status === 'mapped' && res.matched) {
      matchedExistingRoleIds.add(res.matched.id);
      roles.push({
        id: spec.key,
        discordRoleId: res.matched.id,
        name: res.matched.name, // Preserve exact existing role name (never rename)
        aliases: spec.aliases,
        category: spec.category,
        rankOrder: spec.rankOrder,
        position: res.matched.position,
        permissionsBitfield: typeof res.matched.permissions === 'string'
          ? res.matched.permissions
          : res.matched.permissions?.bitfield.toString() ?? '0',
        colorHex: res.matched.hexColor || spec.colorHex,
        selfAssignable: spec.selfAssignable,
        exclusiveGroupId: spec.exclusiveGroupId,
        discoveredFromExisting: true,
        mapped: true,
        mentionable: res.matched.mentionable,
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
        colorHex: spec.colorHex,
        selfAssignable: spec.selfAssignable,
        exclusiveGroupId: spec.exclusiveGroupId,
        discoveredFromExisting: false,
        mapped: false,
        mentionable: spec.mentionable,
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
        colorHex: spec.colorHex,
        selfAssignable: spec.selfAssignable,
        exclusiveGroupId: spec.exclusiveGroupId,
        discoveredFromExisting: false,
        mapped: false,
        mentionable: spec.mentionable,
        lifecycleState: 'missing',
      });
    }
  }

  // Also preserve any additional custom server roles discovered
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
      colorHex: extra.hexColor || '#64748B',
      selfAssignable: false,
      exclusiveGroupId: null,
      discoveredFromExisting: true,
      mapped: false,
      mentionable: extra.mentionable,
      lifecycleState: 'discovered',
    });
  }

  // Build categories & channels against legacy spec + preserve extra existing categories/channels
  const matchedExistingCatIds = new Set<string>();
  const categories: DiscoveredCategory[] = [];

  for (const catSpec of LEGACY_CATEGORY_SPECS) {
    const catRes = resolveCategoryMatch(catSpec, rawCategories);
    const catChannelsSpec = LEGACY_CHANNEL_SPECS.filter((ch) => ch.categoryName === catSpec.name);

    if (catRes.status === 'mapped' && catRes.matched) {
      const existingCat = catRes.matched;
      matchedExistingCatIds.add(existingCat.id);
      const childRawChannels = nonCategoryChannels.filter((ch) => ch.parentId === existingCat.id);
      const matchedChildIds = new Set<string>();
      const mappedChannels: DiscoveredChannel[] = [];

      for (const chSpec of catChannelsSpec) {
        const chRes = resolveChannelMatch(chSpec, childRawChannels);
        if (chRes.status === 'mapped' && chRes.matched) {
          matchedChildIds.add(chRes.matched.id);
          mappedChannels.push({
            id: chSpec.key,
            discordChannelId: chRes.matched.id,
            name: chRes.matched.name, // Preserve exact existing channel name
            type: mapChannelType(chRes.matched),
            categoryId: catSpec.key,
            topic: chRes.matched.topic ?? chSpec.topic,
            isPrivateLeadership: catSpec.isPrivateLeadership,
            accessClassification: chSpec.accessClassification,
            languageCode: chSpec.languageCode,
            mappedRolePurpose: chSpec.key,
            discoveredFromExisting: true,
            required: chSpec.required,
            permissionOverwrites: extractOverwrites(chRes.matched, roleMap),
            lifecycleState: 'mapped',
          });
        } else if (chRes.status === 'conflicting') {
          mappedChannels.push({
            id: chSpec.key,
            discordChannelId: null,
            name: chSpec.name,
            type: chSpec.type,
            categoryId: catSpec.key,
            topic: chSpec.topic,
            isPrivateLeadership: catSpec.isPrivateLeadership,
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
            categoryId: catSpec.key,
            topic: chSpec.topic,
            isPrivateLeadership: catSpec.isPrivateLeadership,
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

      // Include any extra existing channels inside this discovered category
      for (const extraCh of childRawChannels) {
        if (matchedChildIds.has(extraCh.id)) continue;
        mappedChannels.push({
          id: `ch-${extraCh.id}`,
          discordChannelId: extraCh.id,
          name: extraCh.name,
          type: mapChannelType(extraCh),
          categoryId: catSpec.key,
          topic: extraCh.topic ?? '',
          isPrivateLeadership: catSpec.isPrivateLeadership,
          accessClassification: catSpec.isPrivateLeadership ? 'leadership_only' : 'verified_member',
          languageCode: null,
          mappedRolePurpose: null,
          discoveredFromExisting: true,
          required: false,
          permissionOverwrites: extractOverwrites(extraCh, roleMap),
          lifecycleState: 'discovered',
        });
      }

      categories.push({
        id: catSpec.key,
        discordCategoryId: existingCat.id,
        name: existingCat.name, // Preserve exact existing name
        position: existingCat.rawPosition ?? existingCat.position ?? catSpec.position,
        isPrivateLeadership: catSpec.isPrivateLeadership,
        discoveredFromExisting: true,
        lifecycleState: 'mapped',
        permissionOverwrites: extractOverwrites(existingCat, roleMap),
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
        channels: catChannelsSpec.map((chSpec) => ({
          id: chSpec.key,
          discordChannelId: null,
          name: chSpec.name,
          type: chSpec.type,
          categoryId: catSpec.key,
          topic: chSpec.topic,
          isPrivateLeadership: catSpec.isPrivateLeadership,
          accessClassification: chSpec.accessClassification,
          languageCode: chSpec.languageCode,
          mappedRolePurpose: chSpec.key,
          discoveredFromExisting: false,
          required: chSpec.required,
          permissionOverwrites: [],
          lifecycleState: 'missing',
        })),
      });
    }
  }

  // Preserve unmapped existing Discord categories
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
      permissionOverwrites: extractOverwrites(extraCat, roleMap),
      channels: childRawChannels.map((ch) => ({
        id: `ch-${ch.id}`,
        discordChannelId: ch.id,
        name: ch.name,
        type: mapChannelType(ch),
        categoryId: `cat-${extraCat.id}`,
        topic: ch.topic ?? '',
        isPrivateLeadership: extraCat.name.toLowerCase().includes('sanctum'),
        accessClassification: 'verified_member',
        languageCode: null,
        mappedRolePurpose: null,
        discoveredFromExisting: true,
        required: false,
        permissionOverwrites: extractOverwrites(ch, roleMap),
        lifecycleState: 'discovered',
      })),
    });
  }

  // Record uncategorized channels
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
      accessClassification: 'verified_member',
      languageCode: null,
      mappedRolePurpose: null,
      discoveredFromExisting: true,
      required: false,
      permissionOverwrites: extractOverwrites(ch, roleMap),
      lifecycleState: 'discovered',
    }));

  const proposedChanges = computeNonDestructiveDiff(categories, roles);
  const conflictsCount = proposedChanges.filter((c) => c.status === 'conflicting').length;
  const missingCount = proposedChanges.filter((c) => c.status === 'proposed' || c.status === 'missing').length;

  return {
    guildId: existingSnapshot.guildId,
    guildName: discordGuild.name,
    lastDiscoveredAt: now,
    categories,
    uncategorizedChannels,
    roles,
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
): ProposedSetupChange[] {
  const changes: ProposedSetupChange[] = [];

  for (const roleSpec of LEGACY_ROLE_SPECS) {
    const rec = roles.find((r) => r.id === roleSpec.key);
    if (!rec || rec.lifecycleState === 'missing') {
      changes.push({
        id: `create-role-${roleSpec.key}`,
        kind: 'create_role',
        targetName: roleSpec.name,
        reason: 'Missing expected legacy role; will be created additively without privileged permissions.',
        nonDestructive: true,
        status: 'proposed',
        verifiedDiscordId: null,
        error: null,
      });
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
        reason: 'Existing Discord role mapped cleanly; name, ID, and permissions preserved.',
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
        reason: 'Existing category discovered and mapped without altering structure or permissions.',
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
          reason: `Missing channel under ${catSpec.name}; will be created additively on confirmation.`,
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
          reason: `Multiple channel candidates matched under ${catSpec.name}; administrator resolution required.`,
          nonDestructive: true,
          status: 'conflicting',
          verifiedDiscordId: null,
          error: null,
        });
      } else {
        changes.push({
          id: `map-ch-${chSpec.key}`,
          kind: 'map_existing_channel',
          targetName: ch.name,
          parentCategoryName: cat?.name ?? catSpec.name,
          reason: 'Existing channel discovered and mapped cleanly.',
          nonDestructive: true,
          status: 'mapped',
          verifiedDiscordId: ch.discordChannelId,
          error: null,
        });
      }
    }
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
  failures: { targetName: string; error: string }[];
}

/**
 * Executes additive, non-destructive setup against a live (or mocked) Discord Guild.
 * - Re-fetches roles and channels right before writing.
 * - Never renames, moves, deletes, or overwrites permissions on existing resources.
 * - Never grants Administrator automatically.
 * - Marks `status = 'applied'` ONLY after receiving a verified Discord resource ID.
 * - Marks `status = 'failed'` on error so subsequent retries safely target only missing/failed items.
 */
export async function executeAdditiveSetupOnDiscordGuild(
  discordGuild: GuildLike,
  currentSnapshot: ServerDiscoverySnapshot,
  options: SetupExecutionOptions,
): Promise<SetupExecutionReport> {
  // Always re-fetch latest Discord resources before executing writes
  await discordGuild.roles.fetch?.();
  await discordGuild.channels.fetch?.();

  let working = discoverLiveDiscordGuild(discordGuild, currentSnapshot);
  const failures: { targetName: string; error: string }[] = [];
  let appliedCount = 0;
  let skippedConflicts = 0;

  const roleIdByName = new Map<string, string>();
  for (const r of iterateValues(discordGuild.roles.cache)) {
    roleIdByName.set(r.name, r.id);
  }

  const categoryIdByKey = new Map<string, string>();
  for (const c of working.categories) {
    if (c.discordCategoryId) categoryIdByKey.set(c.id, c.discordCategoryId);
  }

  // Track changes cleanly
  const updatedChanges = working.proposedChanges.map((c) => ({ ...c }));

  // Step 1: Create missing roles (never create when conflicting; never grant Administrator)
  for (const change of updatedChanges) {
    if (change.kind === 'resolve_conflict') {
      skippedConflicts += 1;
      continue;
    }
    if (change.kind !== 'create_role') continue;
    if (change.status !== 'proposed' && change.status !== 'confirmed' && change.status !== 'failed') continue;

    const spec = LEGACY_ROLE_SPECS.find((r) => r.name === change.targetName);
    if (!spec) continue;

    // Re-check right before creating
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
        color: spec.colorHex,
        mentionable: spec.mentionable,
        permissions: [], // Never grant Administrator or elevated privileges automatically
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
            overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel] });
          }
        } else if (verifiedRoleId && catSpec.key !== 'cat_05_class_halls') {
          overwrites.push({ id: verifiedRoleId, allow: [PermissionFlagsBits.ViewChannel] });
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

  // Step 3: Create missing channels (respecting required flag when mode === 'missing_only')
  for (const change of updatedChanges) {
    if (change.kind !== 'create_channel') continue;
    if (change.status !== 'proposed' && change.status !== 'confirmed' && change.status !== 'failed') continue;

    const chSpec = LEGACY_CHANNEL_SPECS.find(
      (c) => c.name === change.targetName && (!change.parentCategoryName || c.categoryName === change.parentCategoryName),
    );
    if (!chSpec) continue;
    if (options.mode === 'missing_only' && !chSpec.required) {
      continue;
    }

    const catSpec = LEGACY_CATEGORY_SPECS.find((c) => c.name === chSpec.categoryName);
    const parentId = catSpec ? categoryIdByKey.get(catSpec.key) ?? null : null;
    if (!parentId) {
      change.status = 'failed';
      change.error = `Parent category "${chSpec.categoryName}" does not exist or failed creation.`;
      failures.push({ targetName: chSpec.name, error: change.error });
      continue;
    }

    const existingInCat = iterateValues(discordGuild.channels.cache).filter((c) => c.parentId === parentId);
    const recheck = resolveChannelMatch(chSpec, existingInCat);
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
      if (chSpec.accessClassification === 'class_hall') {
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
        for (const lid of leadershipRoleIds) overwrites.push({ id: lid, allow: [PermissionFlagsBits.ViewChannel] });
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

  // Re-scan final state while preserving `'applied'` and `'failed'` statuses from this run
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
    failures,
  };
}
