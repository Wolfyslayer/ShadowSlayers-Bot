import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ChannelType } from 'discord.js';
import { RuleBasedAutoModEngine } from '../apps/bot/src/services/automod.ts';
import { SLASH_COMMANDS, executeSlashCommand } from '../apps/bot/src/commands/registry.ts';
import {
  createSetupSession,
  handleSetupButtonAction,
} from '../apps/bot/src/commands/setup.ts';
import {
  discoverLiveDiscordGuild,
  executeAdditiveSetupOnDiscordGuild,
  resolveRoleMatch,
  type ChannelLike,
  type GuildLike,
  type RoleLike,
} from '../apps/bot/src/services/discovery.ts';
import { PersistentTaskScheduler } from '../apps/bot/src/services/scheduler.ts';
import { evaluateXpAward } from '../apps/bot/src/services/xp.ts';
import { migrateDatabaseRoot } from '../database/schema-migrations.ts';
import { LocalPersistentAdapter, createDatabaseAdapter } from '../packages/database/src/adapter.ts';
import { createInitialGuildSeed } from '../packages/database/src/seed.ts';
import {
  BASE_TRANSLATION_KEYS,
  calculateCompleteness,
  createLanguageDraft,
  previewLanguageChannels,
} from '../packages/localization/src/engine.ts';
import {
  applySelfRoleSelection,
  canActOnTargetRank,
  canBotManageRolePosition,
  canBotModerateMemberPosition,
  evaluateEffectiveChannelAccess,
  mergeIndependentLanguageRoles,
} from '../packages/permissions/src/hierarchy.ts';
import { resolveAuthorizedDiscordOAuthSession } from '../packages/permissions/src/oauth-authz.ts';
import {
  LEGACY_CATEGORY_SPECS,
  LEGACY_CHANNEL_SPECS,
  LEGACY_ROLE_SPECS,
} from '../packages/shared/src/legacy-template.ts';
import type { DatabaseRoot } from '../packages/shared/src/types.ts';

/**
 * Lightweight mocked Discord Guild factory for unit/integration tests ONLY.
 * These tests do NOT execute against a live Discord server.
 */
function createMockDiscordGuild(opts?: {
  roles?: RoleLike[];
  channels?: ChannelLike[];
  failOnChannelName?: string;
}): GuildLike {
  const roleMap = new Map<string, RoleLike>((opts?.roles ?? []).map((r) => [r.id, r]));
  const channelMap = new Map<string, ChannelLike>((opts?.channels ?? []).map((c) => [c.id, c]));
  let seq = 1000;

  return {
    id: 'guild-mock-1',
    name: 'ShadowSlayers | Legends of Elements',
    roles: {
      cache: roleMap,
      fetch: async () => roleMap,
      create: async ({ name, color, mentionable }) => {
        seq += 1;
        const created: RoleLike = {
          id: `role-${seq}`,
          name,
          position: 10,
          hexColor: typeof color === 'string' ? color : '#64748B',
          mentionable: Boolean(mentionable),
          permissions: { bitfield: 0n },
        };
        roleMap.set(created.id, created);
        return created;
      },
    },
    channels: {
      cache: channelMap,
      fetch: async () => channelMap,
      create: async ({ name, type, parent, topic }) => {
        if (opts?.failOnChannelName && name === opts.failOnChannelName) {
          throw new Error(`Mock Discord 403 Missing Permissions for ${name}`);
        }
        seq += 1;
        const created: ChannelLike = {
          id: `ch-${seq}`,
          name,
          type,
          parentId: parent ?? null,
          rawPosition: seq,
          topic: topic ?? null,
        };
        channelMap.set(created.id, created);
        return created;
      },
    },
  };
}

test('Permissions hierarchy uses exact emoji-prefixed ranks, enforces bot positions, and isolates roles', () => {
  assert.equal(canActOnTargetRank('⚔️ Warlord', '🌱 Recruit'), true);
  assert.equal(canActOnTargetRank('⚔️ Warlord', '⚔️ Warlord'), false);
  assert.equal(canActOnTargetRank('⚔️ Warlord', '👑 Shadow King'), false);
  assert.equal(canActOnTargetRank('👑 Shadow King', '🛡️ Shadow Council'), true);

  assert.equal(canBotManageRolePosition(20, 15), true);
  assert.equal(canBotManageRolePosition(15, 15), false);
  assert.equal(canBotModerateMemberPosition(20, 25), false);

  const merged = mergeIndependentLanguageRoles(['en', 'sv'], ['en', 'ru'], ['en', 'ru']);
  assert.deepEqual(merged, ['en', 'ru', 'sv']);
});

test('Legacy role-selection groups: Language & Class are exclusive, Notifications are multiple, Clan Ranks are blocked', () => {
  const member = {
    clanRank: '🖤 ShadowSlayer' as const,
    languageCodes: ['en'],
    gamingClasses: ['⚔️ Warrior'],
    notificationRoles: ['📢 Event Pings'],
  };

  // Exclusive language switch preserves clanRank
  const langRes = applySelfRoleSelection(member, 'language', 'ru');
  assert.equal(langRes.allowed, true);
  assert.deepEqual(langRes.languageCodes, ['ru']);
  assert.equal(langRes.clanRank, '🖤 ShadowSlayer');

  // Exclusive class switch replaces Warrior with Sorcerer and preserves clanRank
  const classRes = applySelfRoleSelection(member, 'class', '🔮 Sorcerer');
  assert.equal(classRes.allowed, true);
  assert.deepEqual(classRes.gamingClasses, ['🔮 Sorcerer']);
  assert.equal(classRes.clanRank, '🖤 ShadowSlayer');

  // Multiple notification toggle adds Boss Pings while keeping Event Pings
  const notifyRes = applySelfRoleSelection(member, 'notification', '🐉 Boss Pings');
  assert.equal(notifyRes.allowed, true);
  assert.deepEqual(notifyRes.notificationRoles, ['📢 Event Pings', '🐉 Boss Pings']);

  // Attempting to self-assign any clan rank is strictly rejected
  const rankAttempt = applySelfRoleSelection(member, 'class', '👑 Shadow King');
  assert.equal(rankAttempt.allowed, false);
});

test('Discord OR-combination channel access boundary blocks unverified, recruit, and cross-class bypasses', () => {
  const unverifiedWithRecruit = {
    verified: false,
    clanRank: '🌱 Recruit' as const,
    languageCodes: ['en'],
    gamingClasses: ['⚔️ Warrior'],
    notificationRoles: [],
  };
  assert.equal(evaluateEffectiveChannelAccess(unverifiedWithRecruit, 'public_onboarding').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(unverifiedWithRecruit, 'verified_member').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(unverifiedWithRecruit, 'clan_member').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(unverifiedWithRecruit, 'class_hall', '⚔️ Warrior').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(unverifiedWithRecruit, 'leadership_only').canView, false);

  const verifiedWarrior = {
    verified: true,
    clanRank: '🖤 ShadowSlayer' as const,
    languageCodes: ['en'],
    gamingClasses: ['⚔️ Warrior'],
    notificationRoles: [],
  };
  assert.equal(evaluateEffectiveChannelAccess(verifiedWarrior, 'verified_member').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(verifiedWarrior, 'class_hall', '⚔️ Warrior').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(verifiedWarrior, 'class_hall', '🔮 Sorcerer').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(verifiedWarrior, 'leadership_only').canView, false);

  const councilLeader = {
    verified: true,
    clanRank: '🛡️ Shadow Council' as const,
    languageCodes: ['ru'],
    gamingClasses: ['🔮 Sorcerer'],
    notificationRoles: [],
  };
  assert.equal(evaluateEffectiveChannelAccess(councilLeader, 'leadership_only').canView, true);
});

test('Legacy discovery maps all 16 emoji roles and 9 categories cleanly without duplicates, flags ambiguous aliases as conflicting', () => {
  const existingRoles: RoleLike[] = [
    { id: 'r-everyone', name: '@everyone', position: 0, mentionable: false },
    ...LEGACY_ROLE_SPECS.map((s, idx) => ({
      id: `r-legacy-${idx}`,
      name: s.name,
      position: 30 - idx,
      hexColor: s.colorHex,
      mentionable: s.mentionable,
      permissions: { bitfield: 0n },
    })),
  ];

  const catIds = new Map<string, string>();
  const existingChannels: ChannelLike[] = [];
  LEGACY_CATEGORY_SPECS.forEach((c, idx) => {
    const id = `cat-legacy-${idx}`;
    catIds.set(c.name, id);
    existingChannels.push({
      id,
      name: c.name,
      type: ChannelType.GuildCategory,
      parentId: null,
      rawPosition: idx + 1,
    });
  });
  LEGACY_CHANNEL_SPECS.forEach((ch, idx) => {
    existingChannels.push({
      id: `ch-legacy-${idx}`,
      name: ch.name,
      type:
        ch.type === 'voice'
          ? ChannelType.GuildVoice
          : ch.type === 'announcement'
            ? ChannelType.GuildAnnouncement
            : ch.type === 'forum'
              ? ChannelType.GuildForum
              : ChannelType.GuildText,
      parentId: catIds.get(ch.categoryName) ?? null,
      rawPosition: idx + 1,
    });
  });
  // Include an uncategorized channel
  existingChannels.push({
    id: 'ch-uncat-1',
    name: 'legacy-orphan',
    type: ChannelType.GuildText,
    parentId: null,
    rawPosition: 99,
  });

  const mockGuild = createMockDiscordGuild({ roles: existingRoles, channels: existingChannels });
  const seed = createInitialGuildSeed('guild-mock-1');
  const discovered = discoverLiveDiscordGuild(mockGuild, seed.discovery);

  assert.equal(discovered.categories.length, 9);
  assert.equal(discovered.uncategorizedChannels.length, 1);
  assert.equal(discovered.missingCount, 0);
  assert.equal(discovered.conflictsCount, 0);
  assert.ok(discovered.proposedChanges.every((c) => c.status === 'mapped'));

  // Controlled alias match preserves existing role ID & never renames
  const singleAlias = resolveRoleMatch(
    { name: '👑 Shadow King', aliases: ['Shadow King'] },
    [{ id: 'r-existing-sk', name: 'Shadow King', position: 50, mentionable: false }],
  );
  assert.equal(singleAlias.status, 'mapped');
  assert.equal(singleAlias.matched?.id, 'r-existing-sk');
  assert.equal(singleAlias.matched?.name, 'Shadow King');

  // Multiple ambiguous candidates MUST become 'conflicting' (never auto-selected)
  const ambiguous = resolveRoleMatch(
    { name: '⚔️ Warrior', aliases: ['Warrior'] },
    [
      { id: 'r-w1', name: 'Warrior', position: 5, mentionable: false },
      { id: 'r-w2', name: '⚔️ Warrior ', position: 6, mentionable: false },
    ],
  );
  // Note: exact match is trimmed, so test two aliases:
  const ambiguousAliases = resolveRoleMatch(
    { name: '⚔️ Warrior', aliases: ['Warrior', 'warriors'] },
    [
      { id: 'r-w1', name: 'Warrior', position: 5, mentionable: false },
      { id: 'r-w2', name: '🔥 Warrior', position: 6, mentionable: false },
    ],
  );
  assert.equal(ambiguous.status, 'mapped');
  assert.equal(ambiguousAliases.status, 'conflicting');
  assert.equal(ambiguousAliases.candidates.length, 2);
});

test('Ephemeral /setup enforces initiator lock, two-step confirmation, idempotency, and safe retry on partial Discord failures (mocked Discord)', async () => {
  const tmpFile = path.join(os.tmpdir(), `shadowslayers-setup-${Date.now()}.json`);
  const db = new LocalPersistentAdapter(tmpFile, 'guild-mock-1');
  await db.init();

  // Mocked guild with partial failure on 'suggestions' or 'common-hall'
  const mockGuild = createMockDiscordGuild({
    roles: [{ id: 'r-everyone', name: '@everyone', position: 0, mentionable: false }],
    channels: [],
    failOnChannelName: 'common-hall',
  });

  const session = createSetupSession('guild-mock-1', 'admin-1', 'AldricShadow');

  // Different user trying to interact MUST be rejected
  const hijacked = await handleSetupButtonAction(`setup:missing:${session.id}`, {
    guildId: 'guild-mock-1',
    actorUserId: 'other-user-2',
    actorUsername: 'Intruder',
    actorRank: '🛡️ Shadow Council',
    discordGuild: mockGuild,
    db,
  });
  assert.equal(hijacked.ok, false);
  assert.match(hijacked.content, /Only the initiating administrator/);

  // Initiator clicks Missing only -> common-hall fails while others apply cleanly
  const partialRes = await handleSetupButtonAction(`setup:missing:${session.id}`, {
    guildId: 'guild-mock-1',
    actorUserId: 'admin-1',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King',
    discordGuild: mockGuild,
    db,
  });
  assert.equal(partialRes.ok, false);
  assert.equal(partialRes.nextStage, 'retry');
  assert.ok((partialRes.report?.appliedCount ?? 0) > 0);
  assert.equal(partialRes.report?.failedCount, 1);

  // Full setup requires two-step confirmation
  const session2 = createSetupSession('guild-mock-1', 'admin-1', 'AldricShadow');
  const step1 = await handleSetupButtonAction(`setup:full_preview:${session2.id}`, {
    guildId: 'guild-mock-1',
    actorUserId: 'admin-1',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King',
    discordGuild: mockGuild,
    db,
  });
  assert.equal(step1.ok, true);
  assert.equal(step1.nextStage, 'awaiting_full_confirm');

  // Re-running missing_only on a clean mocked guild creates zero duplicates (idempotent)
  const cleanGuild = createMockDiscordGuild({ roles: [{ id: 'r-everyone', name: '@everyone', position: 0, mentionable: false }] });
  const seed = createInitialGuildSeed('guild-mock-1');
  const firstRun = await executeAdditiveSetupOnDiscordGuild(cleanGuild, seed.discovery, {
    mode: 'full_setup',
    actorUsername: 'AldricShadow',
  });
  assert.equal(firstRun.failedCount, 0);
  assert.ok(firstRun.appliedCount > 0);

  const secondRun = await executeAdditiveSetupOnDiscordGuild(cleanGuild, firstRun.snapshot, {
    mode: 'full_setup',
    actorUsername: 'AldricShadow',
  });
  assert.equal(secondRun.appliedCount, 0);
  assert.equal(secondRun.failedCount, 0);

  fs.rmSync(tmpFile, { force: true });
});

test('Discord OAuth2 authorization enforces default-deny guild membership and live role checks', () => {
  const seed = createInitialGuildSeed('guild-real-1');
  const councilRole = seed.discovery.roles.find((r) => r.name === '🛡️ Shadow Council');
  assert.ok(councilRole);
  councilRole.discordRoleId = 'role-council-1';

  // 1. User NOT in target guild -> denied (403)
  const outsider = resolveAuthorizedDiscordOAuthSession({
    discordUser: { id: 'u-999', username: 'Stranger', avatar: null },
    userGuildIds: ['other-guild'],
    targetGuildId: 'guild-real-1',
    liveMemberRoleIds: null,
    guildState: seed,
  });
  assert.equal(outsider.authorized, false);
  assert.equal(outsider.statusCode, 403);

  // 2. Member in guild WITHOUT leadership role -> denied (403), NEVER defaults to Shadow Council
  const ordinaryMember = resolveAuthorizedDiscordOAuthSession({
    discordUser: { id: 'u-105', username: 'DravenAsh', avatar: null },
    userGuildIds: ['guild-real-1'],
    targetGuildId: 'guild-real-1',
    liveMemberRoleIds: ['some-non-admin-role'],
    guildState: seed,
  });
  assert.equal(ordinaryMember.authorized, false);
  assert.equal(ordinaryMember.statusCode, 403);

  // 3. Verified guild member holding live 🛡️ Shadow Council role -> authorized (200)
  const authorizedCouncil = resolveAuthorizedDiscordOAuthSession({
    discordUser: { id: 'u-102', username: 'LyraDawn', avatar: null },
    userGuildIds: ['guild-real-1'],
    targetGuildId: 'guild-real-1',
    liveMemberRoleIds: ['role-council-1'],
    guildState: seed,
  });
  assert.equal(authorizedCouncil.authorized, true);
  assert.equal(authorizedCouncil.statusCode, 200);
  assert.equal(authorizedCouncil.session?.clanRank, '🛡️ Shadow Council');
});

test('Moderation execution transparently distinguishes verified_live, dry_run_no_bot, and failed Discord responses', async () => {
  const tmpFile = path.join(os.tmpdir(), `shadowslayers-mod-${Date.now()}.json`);
  const db = new LocalPersistentAdapter(tmpFile, 'shadowslayers-primary');
  await db.init();

  // 1. Live Discord executor rejects -> returns ok: false and logs status='failed'
  const failedCmd = await executeSlashCommand('timeout', {
    guildId: 'shadowslayers-primary',
    actorUserId: 'u-101',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King',
    locale: 'en',
    channelName: 'common-hall',
    args: { member: 'DravenAsh', minutes: 10, reason: 'Mock Discord failure check' },
    db,
    discordExecutor: {
      executeModeration: async () => ({ ok: false, error: 'Missing ModerateMembers permission' }),
    },
  });
  assert.equal(failedCmd.ok, false);
  assert.equal(failedCmd.data?.discordExecutionStatus, 'failed');

  // 2. Live Discord executor succeeds -> returns ok: true and status='verified_live'
  const okCmd = await executeSlashCommand('timeout', {
    guildId: 'shadowslayers-primary',
    actorUserId: 'u-101',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King',
    locale: 'en',
    channelName: 'common-hall',
    args: { member: 'DravenAsh', minutes: 10, reason: 'Mock Discord success check' },
    db,
    discordExecutor: {
      executeModeration: async () => ({ ok: true }),
    },
  });
  assert.equal(okCmd.ok, true);
  assert.equal(okCmd.data?.discordExecutionStatus, 'verified_live');

  fs.rmSync(tmpFile, { force: true });
});

test('Database adapter refuses silent fallback to local JSON when firestore or supabase is configured', () => {
  assert.throws(
    () => createDatabaseAdapter('firestore', '.data/test.json', 'shadowslayers-primary', 'production'),
    /Silent fallback to local JSON storage is forbidden in production/,
  );
  assert.throws(
    () => createDatabaseAdapter('supabase', '.data/test.json', 'shadowslayers-primary', 'production'),
    /Silent fallback to local JSON storage is forbidden in production/,
  );
});

test('Schema migration v1 -> v2 upgrades unprefixed rank names cleanly to exact emoji-prefixed ranks', () => {
  const seed = createInitialGuildSeed();
  const legacyV1: DatabaseRoot = {
    schemaVersion: 1,
    adminAuth: null,
    guilds: {
      [seed.guildId]: {
        ...seed,
        schemaVersion: 1,
        members: seed.members.map((m, i) => ({
          ...m,
          clanRank: (i === 0 ? 'Shadow King' : 'Recruit') as unknown as DatabaseRoot['guilds'][string]['members'][number]['clanRank'],
        })),
      },
    },
  };
  const migrated = migrateDatabaseRoot(legacyV1);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.guilds[seed.guildId].members[0].clanRank, '👑 Shadow King');
  assert.equal(migrated.guilds[seed.guildId].members[1].clanRank, '🌱 Recruit');
});

test('Dynamic multilingual engine creates draft languages without AI and validates completeness', () => {
  const { config, bundle } = createLanguageDraft({
    code: 'sv',
    name: 'Swedish',
    nativeName: 'Svenska',
    flagEmoji: '🇸🇪',
    actorName: 'AldricShadow',
  });

  const initialReport = calculateCompleteness(config, bundle);
  assert.equal(initialReport.completenessPercent, 0);
  assert.equal(initialReport.readyForPublication, false);
  assert.equal(initialReport.missingKeys.length, Object.keys(BASE_TRANSLATION_KEYS).length);

  for (const key of Object.keys(BASE_TRANSLATION_KEYS)) {
    bundle.entries[key] = `SV: ${BASE_TRANSLATION_KEYS[key]}`;
  }
  config.welcomeMessage = 'Välkommen till ShadowSlayers';
  config.rulesSummary = 'Följ klanens regler.';
  config.review.status = 'approved';

  const completedReport = calculateCompleteness(config, bundle);
  assert.equal(completedReport.completenessPercent, 100);
  assert.equal(completedReport.readyForPublication, true);

  const preview = previewLanguageChannels(config);
  assert.equal(preview.categoryName, '🇸🇪 Swedish');
  assert.equal(preview.channels[0].name, '🇸🇪・sv-welcome');
  assert.equal(preview.channels[1].name, '🇸🇪・sv-rules');
});

test('Rule-based AutoMod detects invites/mentions, honors exemptions, and never permabans', () => {
  const seed = createInitialGuildSeed();
  const engine = new RuleBasedAutoModEngine();

  const inviteHit = engine.evaluateMessage(seed.automod, {
    userId: 'u-999',
    username: 'TestUser',
    content: 'Join https://discord.gg/abc123 now!',
    channelName: 'common-hall',
    userRoles: ['🌱 Recruit'],
    mentionCount: 0,
  });
  assert.equal(inviteHit.triggered, true);
  assert.ok(inviteHit.ruleHits.includes('discord_invite'));
  assert.equal((inviteHit.recommendedActions as string[]).includes('ban'), false);

  const exempt = engine.evaluateMessage(seed.automod, {
    userId: 'u-101',
    username: 'AldricShadow',
    content: 'discord.gg/internal',
    channelName: 'council-chamber',
    userRoles: ['👑 Shadow King'],
    mentionCount: 10,
  });
  assert.equal(exempt.triggered, false);
  assert.equal(exempt.exempt, true);
});

test('Anti-farming XP engine enforces cooldowns and duplicate suppression', () => {
  const seed = createInitialGuildSeed();
  const member = { ...seed.members[4], lastXpAt: null, lastMessageHash: null };
  const now = Date.now();

  const first = evaluateXpAward(member, seed.progression, 'Coordinating Friday dungeon run!', now);
  assert.equal(first.awarded, true);
  assert.ok(first.xpAdded > 0);

  const burstMember = { ...member, lastXpAt: new Date(now).toISOString() };
  const second = evaluateXpAward(burstMember, seed.progression, 'Another message right away', now + 5_000);
  assert.equal(second.awarded, false);
  assert.equal(second.blockedReason, 'cooldown_active');
});

test('Persistent scheduler executes due tasks idempotently without double runs', async () => {
  const tmpFile = path.join(os.tmpdir(), `shadowslayers-test-${Date.now()}.json`);
  const db = new LocalPersistentAdapter(tmpFile, 'shadowslayers-primary');
  await db.init();

  const guild = await db.getGuild('shadowslayers-primary');
  assert.ok(guild);
  const pastIso = new Date(Date.now() - 60_000).toISOString();
  guild.scheduledTasks.push({
    id: 'task-test-rem',
    guildId: guild.guildId,
    type: 'reminder',
    targetId: 'rem-1',
    description: 'Due reminder test',
    runAt: pastIso,
    status: 'pending',
    attempts: 0,
    lastError: null,
    completedAt: null,
    createdAt: pastIso,
  });
  await db.saveGuild(guild);

  const scheduler = new PersistentTaskScheduler(db);
  const firstRun = await scheduler.tick();
  const secondRun = await scheduler.tick();
  assert.equal(firstRun, 1);
  assert.equal(secondRun, 0);

  fs.rmSync(tmpFile, { force: true });
});

test('All required slash commands exist and /roles publish executes without touching server setup', async () => {
  const names = new Set(SLASH_COMMANDS.map((c) => c.name));
  for (const required of [
    'help', 'about', 'profile', 'server', 'language', 'modules', 'dashboard',
    'setup', 'config', 'permissions', 'roles', 'roles publish',
    'warn', 'warnings', 'timeout', 'untimeout', 'kick', 'ban', 'tempban', 'unban',
    'purge', 'slowmode', 'lock', 'unlock', 'modlog', 'case', 'appeal',
    'suggest', 'poll', 'giveaway', 'event', 'remind',
    'recruitment', 'apply', 'applications', 'ticket',
    'clan', 'members', 'leaderboard', 'achievements', 'activity',
  ]) {
    assert.ok(names.has(required), `Missing slash command: ${required}`);
  }

  const tmpFile = path.join(os.tmpdir(), `shadowslayers-cmd-${Date.now()}.json`);
  const db = new LocalPersistentAdapter(tmpFile, 'shadowslayers-primary');
  await db.init();

  const res = await executeSlashCommand('roles publish', {
    guildId: 'shadowslayers-primary',
    actorUserId: 'u-101',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King',
    locale: 'en',
    channelName: 'role-selection',
    args: { panelId: 'panel-languages' },
    db,
  });
  assert.equal(res.ok, true);
  fs.rmSync(tmpFile, { force: true });
});
