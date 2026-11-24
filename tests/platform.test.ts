import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
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
import {
  applyRulesVerificationReaction,
  computeMemberOnboardingStatus,
  grantActivePlayerRecruit,
} from '../apps/bot/src/services/onboarding.ts';
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
  auditGuildPermissions,
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
  OPTIONAL_EXTENSION_CHANNELS,
} from '../packages/shared/src/legacy-template.ts';
import type { DatabaseRoot } from '../packages/shared/src/types.ts';
import { CANONICAL_LEGACY_FIXTURE } from './legacy-fixture.ts';

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
          hexColor: typeof color === 'string' ? color : '#000000',
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
      create: async ({ name, type, parent, topic, permissionOverwrites }) => {
        if (opts?.failOnChannelName && name === opts.failOnChannelName) {
          throw new Error(`Mock Discord 403 Missing Permissions for ${name}`);
        }
        const toFlagNames = (flags?: bigint[]): string[] =>
          (flags ?? []).map((f) => {
            if (f === PermissionFlagsBits.ViewChannel) return 'ViewChannel';
            if (f === PermissionFlagsBits.SendMessages) return 'SendMessages';
            return String(f);
          });
        seq += 1;
        const created: ChannelLike = {
          id: `ch-${seq}`,
          name,
          type,
          parentId: parent ?? null,
          rawPosition: seq,
          topic: topic ?? null,
          permissionOverwrites: permissionOverwrites
            ? {
                cache: new Map(
                  permissionOverwrites.map((po, i) => [
                    `ow-${i}`,
                    {
                      id: po.id,
                      type: 0,
                      allow: { toArray: () => toFlagNames(po.allow) },
                      deny: { toArray: () => toFlagNames(po.deny) },
                    },
                  ]),
                ),
              }
            : undefined,
        };
        channelMap.set(created.id, created);
        return created;
      },
    },
  };
}

test('Canonical Phase 0.2 template preserves exact 16 roles, 9 categories, 32 text channels, 5 voice channels, and null unknown properties', () => {
  assert.equal(LEGACY_ROLE_SPECS.length, 16);
  assert.deepEqual(LEGACY_ROLE_SPECS.map((r) => r.name), CANONICAL_LEGACY_FIXTURE.roles.all16);

  // Unknown legacy properties are preserved as null/review-required, never invented
  for (const role of LEGACY_ROLE_SPECS) {
    assert.equal(role.colorHex, null, `Role ${role.name} should not invent a hex color`);
    assert.equal(role.hoist, null, `Role ${role.name} should not invent hoist flag`);
    assert.equal(role.requiresAdminReview, true);
  }
  const shadowKing = LEGACY_ROLE_SPECS.find((r) => r.name === '👑 Shadow King');
  assert.equal(shadowKing?.excludeFromAutoSetup, true);

  assert.equal(LEGACY_CATEGORY_SPECS.length, 9);
  assert.deepEqual(LEGACY_CATEGORY_SPECS.map((c) => c.name), CANONICAL_LEGACY_FIXTURE.categories9);

  const textSpecs = LEGACY_CHANNEL_SPECS.filter((c) => c.type !== 'voice');
  const voiceSpecs = LEGACY_CHANNEL_SPECS.filter((c) => c.type === 'voice');
  assert.equal(textSpecs.length, 32);
  assert.equal(voiceSpecs.length, 5);

  for (const [catName, expectedNames] of Object.entries(CANONICAL_LEGACY_FIXTURE.textChannelsByCategory)) {
    const actual = textSpecs.filter((c) => c.categoryName === catName).map((c) => c.name);
    assert.deepEqual(actual, expectedNames, `Text channel mismatch in ${catName}`);
  }
  for (const [catName, expectedNames] of Object.entries(CANONICAL_LEGACY_FIXTURE.voiceChannelsByCategory)) {
    const actual = voiceSpecs.filter((c) => c.categoryName === catName).map((c) => c.name);
    assert.deepEqual(actual, expectedNames, `Voice channel mismatch in ${catName}`);
  }

  for (const roName of CANONICAL_LEGACY_FIXTURE.readOnlyMemberChannels) {
    const spec = LEGACY_CHANNEL_SPECS.find((c) => c.name === roName);
    assert.equal(spec?.readOnlyForMembers, true, `${roName} must be readOnlyForMembers=true`);
  }

  // Optional non-legacy extensions are strictly separate from canonical specs
  assert.equal(OPTIONAL_EXTENSION_CHANNELS.length, 2);
  assert.equal(LEGACY_CHANNEL_SPECS.some((c) => c.name === '💡・suggestions' || c.name === '📜・audit-logs'), false);
});

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

test('Legacy role-selection groups: Language & Class are exclusive, Notifications are multiple, Clan Ranks & Verified are blocked', () => {
  const member = {
    clanRank: '🖤 ShadowSlayer' as const,
    languageCodes: ['en'],
    gamingClasses: ['⚔️ Warrior'],
    notificationRoles: ['📢 Event Pings'],
  };

  const langRes = applySelfRoleSelection(member, 'language', 'ru');
  assert.equal(langRes.allowed, true);
  assert.deepEqual(langRes.languageCodes, ['ru']);
  assert.equal(langRes.clanRank, '🖤 ShadowSlayer');

  const classRes = applySelfRoleSelection(member, 'class', '🔮 Sorcerer');
  assert.equal(classRes.allowed, true);
  assert.deepEqual(classRes.gamingClasses, ['🔮 Sorcerer']);
  assert.equal(classRes.clanRank, '🖤 ShadowSlayer');

  const notifyRes = applySelfRoleSelection(member, 'notification', '🐉 Boss Pings');
  assert.equal(notifyRes.allowed, true);
  assert.deepEqual(notifyRes.notificationRoles, ['📢 Event Pings', '🐉 Boss Pings']);

  assert.equal(applySelfRoleSelection(member, 'class', '👑 Shadow King').allowed, false);
  assert.equal(applySelfRoleSelection(member, 'notification', '✅ Verified').allowed, false);
  assert.equal(applySelfRoleSelection(member, 'language', '🤖 Bots').allowed, false);
});

test('All 10 Discord OR-combination role access cases and read-only channel rules hold', () => {
  // 1. Unverified + Warrior
  const c1 = { verified: false, clanRank: null, hasClanRank: false, languageCodes: [], gamingClasses: ['⚔️ Warrior'], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c1, 'public_onboarding', undefined, true).canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c1, 'public_onboarding', undefined, true).canSend, false);
  assert.equal(evaluateEffectiveChannelAccess(c1, 'verified_member').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(c1, 'class_hall', '⚔️ Warrior').canView, false);

  // 2. Unverified + Recruit
  const c2 = { verified: false, clanRank: '🌱 Recruit' as const, hasClanRank: true, languageCodes: [], gamingClasses: [], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c2, 'verified_member').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(c2, 'clan_member').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(c2, 'leadership_only').canView, false);

  // 3. Verified + English
  const c3 = { verified: true, clanRank: null, hasClanRank: false, languageCodes: ['en'], gamingClasses: [], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c3, 'verified_member').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c3, 'verified_member', undefined, false, 'en').canSend, true);
  assert.equal(evaluateEffectiveChannelAccess(c3, 'verified_member', undefined, false, 'ru').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(c3, 'clan_member').canView, false);

  // 4. Verified + Notification pings
  const c4 = { verified: true, clanRank: null, hasClanRank: false, languageCodes: [], gamingClasses: [], notificationRoles: ['📢 Event Pings', '🐉 Boss Pings'] };
  assert.equal(evaluateEffectiveChannelAccess(c4, 'verified_member').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c4, 'verified_member', undefined, false, 'en').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(c4, 'clan_member').canView, false);

  // 5. Verified + Recruit + Warrior
  const c5 = { verified: true, clanRank: '🌱 Recruit' as const, hasClanRank: true, languageCodes: ['en'], gamingClasses: ['⚔️ Warrior'], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c5, 'class_hall', '⚔️ Warrior').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c5, 'class_hall', '🔮 Sorcerer').canView, false);
  assert.equal(evaluateEffectiveChannelAccess(c5, 'clan_member').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c5, 'clan_member', undefined, true).canSend, false);
  assert.equal(evaluateEffectiveChannelAccess(c5, 'leadership_only').canView, false);

  // 6. Verified + ShadowSlayer + English
  const c6 = { verified: true, clanRank: '🖤 ShadowSlayer' as const, hasClanRank: true, languageCodes: ['en'], gamingClasses: [], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c6, 'clan_member').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c6, 'clan_member', undefined, true).canSend, false);
  assert.equal(evaluateEffectiveChannelAccess(c6, 'leadership_only').canView, false);

  // 7. Verified + Elite Warrior + Warrior
  const c7 = { verified: true, clanRank: '🔥 Elite Warrior' as const, hasClanRank: true, languageCodes: ['ru'], gamingClasses: ['⚔️ Warrior'], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c7, 'clan_member').canSend, true);
  assert.equal(evaluateEffectiveChannelAccess(c7, 'class_hall', '⚔️ Warrior').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c7, 'leadership_only').canView, false);

  // 8. Verified + Warlord + Warrior
  const c8 = { verified: true, clanRank: '⚔️ Warlord' as const, hasClanRank: true, languageCodes: ['en'], gamingClasses: ['⚔️ Warrior'], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c8, 'leadership_only').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c8, 'clan_member', undefined, true).canSend, true);

  // 9. Verified + Shadow Council
  const c9 = { verified: true, clanRank: '🛡️ Shadow Council' as const, hasClanRank: true, languageCodes: ['ru'], gamingClasses: [], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c9, 'leadership_only').canView, true);
  assert.equal(evaluateEffectiveChannelAccess(c9, 'class_hall', '🗡️ Swordsman').canView, true);

  // 10. Verified + Shadow King
  const c10 = { verified: true, clanRank: '👑 Shadow King' as const, hasClanRank: true, languageCodes: ['en', 'ru'], gamingClasses: [], notificationRoles: [] };
  assert.equal(evaluateEffectiveChannelAccess(c10, 'leadership_only').canSend, true);
  assert.equal(evaluateEffectiveChannelAccess(c10, 'public_onboarding', undefined, true).canSend, true);
});

test('5-step onboarding enforces rules gate, deliberate removal policy, dynamic role status, and gated 🌱 Recruit', () => {
  const guild = createInitialGuildSeed('guild-onb-1');

  // Step 1: Member reacts ✅ on 📜・rules -> gets ✅ Verified, remains unranked (no automatic 🌱 Recruit)
  const verifyRes = applyRulesVerificationReaction(guild, {
    userId: 'u-new-1',
    username: 'KaelenNew',
    added: true,
  });
  assert.equal(verifyRes.verified, true);
  const member = guild.members.find((m) => m.userId === 'u-new-1')!;
  assert.equal(member.verified, true);
  assert.equal(member.hasClanRank, false);

  // Attempting Step 5 active-player action before Language & Class are selected MUST fail
  const premature = grantActivePlayerRecruit(guild, {
    userId: 'u-new-1',
    username: 'KaelenNew',
    actualDiscordRoleNames: ['✅ Verified'],
  });
  assert.equal(premature.ok, false);
  assert.equal(premature.grantedRole, null);

  // Step 2 & 3: Member selects Language + Class + optional Notification
  member.languageCodes = ['en'];
  member.gamingClasses = ['⚔️ Warrior'];
  member.notificationRoles = ['🐉 Boss Pings'];
  const liveRoles = ['✅ Verified', '🇬🇧 English', '⚔️ Warrior', '🐉 Boss Pings'];

  const derivedReady = computeMemberOnboardingStatus(member, liveRoles, verifyRes.record);
  assert.equal(derivedReady.step1RulesVerified, true);
  assert.equal(derivedReady.step2LanguageSelected, '🇬🇧 English');
  assert.equal(derivedReady.step3ClassSelected, '⚔️ Warrior');
  assert.equal(derivedReady.step4NotificationsCount, 1);
  assert.equal(derivedReady.readyForActivePlayerRecruit, true);
  assert.equal(derivedReady.step5RecruitGranted, false);

  // Step 5: Active-player confirmation grants 🌱 Recruit
  const activeRes = grantActivePlayerRecruit(guild, {
    userId: 'u-new-1',
    username: 'KaelenNew',
    actualDiscordRoleNames: liveRoles,
  });
  assert.equal(activeRes.ok, true);
  assert.equal(activeRes.grantedRole, '🌱 Recruit');
  assert.equal(activeRes.status.completed, true);

  // Deliberate removal policy: removing ✅ reaction revokes ✅ Verified WITHOUT wiping Language/Class/Notifications/Rank
  const revokeRes = applyRulesVerificationReaction(guild, {
    userId: 'u-new-1',
    username: 'KaelenNew',
    added: false,
  });
  assert.equal(revokeRes.verified, false);
  assert.deepEqual(member.languageCodes, ['en']);
  assert.deepEqual(member.gamingClasses, ['⚔️ Warrior']);
  assert.deepEqual(member.notificationRoles, ['🐉 Boss Pings']);
  assert.equal(member.clanRank, '🌱 Recruit');

  // Higher existing clan rank is preserved and never demoted to 🌱 Recruit
  const warlord = guild.members.find((m) => m.clanRank === '⚔️ Warlord')!;
  const warlordRes = grantActivePlayerRecruit(guild, {
    userId: warlord.userId,
    username: warlord.username,
    actualDiscordRoleNames: ['✅ Verified', '🇬🇧 English', '⚔️ Warrior', '⚔️ Warlord'],
  });
  assert.equal(warlordRes.ok, true);
  assert.equal(warlordRes.grantedRole, null);
  assert.equal(warlordRes.status.currentClanRank, '⚔️ Warlord');
});

test('Discovery detects misplaced channels, channel type mismatches, permission drifts, and ambiguous conflicts without mutating', () => {
  const existingRoles: RoleLike[] = [
    { id: 'r-everyone', name: '@everyone', position: 0, mentionable: false },
    ...LEGACY_ROLE_SPECS.map((s, idx) => ({
      id: `r-legacy-${idx}`,
      name: s.name,
      position: 30 - idx,
      hexColor: '#123456',
      mentionable: s.mentionable,
      permissions: { bitfield: 0n },
    })),
  ];

  const catIds = new Map<string, string>();
  const existingChannels: ChannelLike[] = [];
  LEGACY_CATEGORY_SPECS.forEach((c, idx) => {
    const id = `cat-legacy-${idx}`;
    catIds.set(c.name, id);
    // Intentionally omit @everyone ViewChannel deny on category 07 to test permission drift audit
    existingChannels.push({
      id,
      name: c.name,
      type: ChannelType.GuildCategory,
      parentId: null,
      rawPosition: idx + 1,
      permissionOverwrites:
        c.name === '👑 07 — THE INNER SANCTUM'
          ? { cache: new Map() }
          : {
              cache: new Map([
                ['ow-everyone', { id: 'r-everyone', type: 0, allow: { toArray: () => [] }, deny: { toArray: () => ['ViewChannel'] } }],
              ]),
            },
    });
  });

  LEGACY_CHANNEL_SPECS.forEach((ch, idx) => {
    // Misplace '💬・general-chat' under Gate of Shadows, and mismatch type on '📢・announcements'
    const parentName = ch.name === '💬・general-chat' ? '📜 01 — GATE OF SHADOWS' : ch.categoryName;
    const actualType =
      ch.name === '📢・announcements'
        ? ChannelType.GuildAnnouncement
        : ch.type === 'voice'
          ? ChannelType.GuildVoice
          : ch.type === 'announcement'
            ? ChannelType.GuildAnnouncement
            : ChannelType.GuildText;

    existingChannels.push({
      id: `ch-legacy-${idx}`,
      name: ch.name,
      type: actualType,
      parentId: catIds.get(parentName) ?? null,
      rawPosition: idx + 1,
    });
  });

  const mockGuild = createMockDiscordGuild({ roles: existingRoles, channels: existingChannels });
  const seed = createInitialGuildSeed('guild-mock-1');
  const discovered = discoverLiveDiscordGuild(mockGuild, seed.discovery);

  assert.equal(discovered.categories.length, 9);
  assert.equal(discovered.incorrectPlacements.length, 1);
  assert.equal(discovered.incorrectPlacements[0].channelName, '💬・general-chat');
  assert.equal(discovered.incorrectPlacements[0].expectedCategoryName, '🔥 02 — THE COMMON HALL');
  assert.equal(discovered.incorrectPlacements[0].actualCategoryName, '📜 01 — GATE OF SHADOWS');

  assert.equal(discovered.incorrectTypes.length, 1);
  assert.equal(discovered.incorrectTypes[0].channelName, '📢・announcements');
  assert.equal(discovered.incorrectTypes[0].expectedType, 'text');
  assert.equal(discovered.incorrectTypes[0].actualType, 'announcement');

  assert.ok(discovered.permissionDifferences.length > 0);
  const permAudit = auditGuildPermissions(discovered.categories, discovered.roles, 'r-everyone');
  assert.ok(permAudit.some((f) => f.targetName === '👑 07 — THE INNER SANCTUM'));

  const ambiguousAliases = resolveRoleMatch(
    { name: '⚔️ Warrior', aliases: ['Warrior', 'warriors'] },
    [
      { id: 'r-w1', name: 'Warrior', position: 5, mentionable: false },
      { id: 'r-w2', name: '🔥 Warrior', position: 6, mentionable: false },
    ],
  );
  assert.equal(ambiguousAliases.status, 'conflicting');
  assert.equal(ambiguousAliases.candidates.length, 2);
});

test('Ephemeral /setup excludes 👑 Shadow King, enforces initiator lock, retry, and idempotency (mocked Discord)', async () => {
  const tmpFile = path.join(os.tmpdir(), `shadowslayers-setup-${Date.now()}.json`);
  const db = new LocalPersistentAdapter(tmpFile, 'guild-mock-1');
  await db.init();

  const mockGuild = createMockDiscordGuild({
    roles: [{ id: 'r-everyone', name: '@everyone', position: 0, mentionable: false }],
    channels: [],
    failOnChannelName: '💬・general-chat',
  });

  const session = createSetupSession('guild-mock-1', 'admin-1', 'AldricShadow');
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
  assert.equal(partialRes.report?.failedCount, 1);

  // Clean guild full additive setup excludes 👑 Shadow King and creates 15 auto-creatable roles + 9 categories + 37 channels
  const cleanGuild = createMockDiscordGuild({ roles: [{ id: 'r-everyone', name: '@everyone', position: 0, mentionable: false }] });
  const seed = createInitialGuildSeed('guild-mock-1');
  const firstRun = await executeAdditiveSetupOnDiscordGuild(cleanGuild, seed.discovery, {
    mode: 'full_setup',
    actorUsername: 'AldricShadow',
  });
  assert.equal(firstRun.failedCount, 0);
  assert.ok(firstRun.skippedManualItems.includes('👑 Shadow King'));
  assert.equal([...cleanGuild.roles.cache.values()].some((r) => r.name === '👑 Shadow King'), false);
  // 15 auto-creatable roles + 9 categories + 37 channels = 61
  assert.equal(firstRun.appliedCount, 61);

  // Idempotent second run creates zero duplicates
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

  const outsider = resolveAuthorizedDiscordOAuthSession({
    discordUser: { id: 'u-999', username: 'Stranger', avatar: null },
    userGuildIds: ['other-guild'],
    targetGuildId: 'guild-real-1',
    liveMemberRoleIds: null,
    guildState: seed,
  });
  assert.equal(outsider.authorized, false);
  assert.equal(outsider.statusCode, 403);

  const ordinaryMember = resolveAuthorizedDiscordOAuthSession({
    discordUser: { id: 'u-105', username: 'DravenAsh', avatar: null },
    userGuildIds: ['guild-real-1'],
    targetGuildId: 'guild-real-1',
    liveMemberRoleIds: ['some-non-admin-role'],
    guildState: seed,
  });
  assert.equal(ordinaryMember.authorized, false);
  assert.equal(ordinaryMember.statusCode, 403);

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

test('Moderation execution blocks unconfirmed destructive actions and distinguishes verified_live vs failed Discord responses', async () => {
  const tmpFile = path.join(os.tmpdir(), `shadowslayers-mod-${Date.now()}.json`);
  const db = new LocalPersistentAdapter(tmpFile, 'shadowslayers-primary');
  await db.init();

  const unconfirmedBan = await executeSlashCommand('ban', {
    guildId: 'shadowslayers-primary',
    actorUserId: 'u-101',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King',
    locale: 'en',
    channelName: '💬・general-chat',
    args: { member: 'DravenAsh', reason: 'Test unconfirmed guard', confirmed: false },
    db,
  });
  assert.equal(unconfirmedBan.ok, false);
  assert.match(unconfirmedBan.title, /Confirmation Required/);

  const failedCmd = await executeSlashCommand('timeout', {
    guildId: 'shadowslayers-primary',
    actorUserId: 'u-101',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King',
    locale: 'en',
    channelName: '💬・general-chat',
    args: { member: 'DravenAsh', minutes: 10, reason: 'Mock Discord failure check' },
    db,
    discordExecutor: {
      executeModeration: async () => ({ ok: false, error: 'Missing ModerateMembers permission' }),
    },
  });
  assert.equal(failedCmd.ok, false);
  assert.equal(failedCmd.data?.discordExecutionStatus, 'failed');

  const okCmd = await executeSlashCommand('timeout', {
    guildId: 'shadowslayers-primary',
    actorUserId: 'u-101',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King',
    locale: 'en',
    channelName: '💬・general-chat',
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

test('Schema migration v1/v2 -> v3 preserves members, initializes Phase 0.2 fields, and normalizes legacy ranks', () => {
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
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.guilds[seed.guildId].schemaVersion, 3);
  assert.equal(migrated.guilds[seed.guildId].members[0].clanRank, '👑 Shadow King');
  assert.equal(migrated.guilds[seed.guildId].members[1].clanRank, '🌱 Recruit');
  assert.ok(Array.isArray(migrated.guilds[seed.guildId].onboardingRecords));
  assert.ok(Array.isArray(migrated.guilds[seed.guildId].customResponses));
  assert.ok(Array.isArray(migrated.guilds[seed.guildId].falsePositiveReports));
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
    channelName: '💬・general-chat',
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
    channelName: '👑・leader-chat',
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

test('Phase 0.2 slash command parity executes cleanly across all required commands', async () => {
  const names = new Set(SLASH_COMMANDS.map((c) => c.name));
  for (const required of [
    'help', 'about', 'bot-status', 'profile', 'userinfo', 'avatar', 'server', 'serverinfo',
    'language', 'onboarding', 'modules', 'dashboard',
    'setup', 'config', 'permissions', 'permissions preview', 'rules publish', 'custom-response',
    'roles', 'roles publish', 'automod status', 'automod test', 'false-positive',
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

  const baseCtx = {
    guildId: 'shadowslayers-primary',
    actorUserId: 'u-101',
    actorUsername: 'AldricShadow',
    actorRank: '👑 Shadow King' as const,
    locale: 'en',
    channelName: '🎭・choose-your-role',
    db,
  };

  assert.equal((await executeSlashCommand('roles publish', { ...baseCtx, args: { panelId: 'panel-languages' } })).ok, true);
  assert.equal((await executeSlashCommand('roles list', { ...baseCtx, args: {} })).ok, true);
  assert.equal((await executeSlashCommand('permissions preview', { ...baseCtx, args: {} })).ok, true);
  assert.equal((await executeSlashCommand('permissions matrix', { ...baseCtx, args: {} })).ok, true);
  assert.equal((await executeSlashCommand('rules publish', { ...baseCtx, args: { channel: '📜・rules' } })).ok, true);
  assert.equal((await executeSlashCommand('bot-status', { ...baseCtx, args: {} })).ok, true);
  assert.equal((await executeSlashCommand('automod status', { ...baseCtx, args: {} })).ok, true);
  assert.equal((await executeSlashCommand('automod test', { ...baseCtx, args: { content: 'discord.gg/abc' } })).ok, true);
  assert.equal((await executeSlashCommand('onboarding', { ...baseCtx, args: {} })).ok, true);
  assert.equal((await executeSlashCommand('serverinfo', { ...baseCtx, args: {} })).ok, true);
  assert.equal((await executeSlashCommand('userinfo', { ...baseCtx, args: { member: 'AldricShadow' } })).ok, true);
  assert.equal((await executeSlashCommand('avatar', { ...baseCtx, args: { member: 'AldricShadow' } })).ok, true);
  assert.equal(
    (await executeSlashCommand('custom-response', { ...baseCtx, args: { action: 'add', trigger: '!guide', response: 'See 📖・guides-and-tips' } })).ok,
    true,
  );
  assert.equal(
    (await executeSlashCommand('false-positive', { ...baseCtx, args: { channel: '💬・general-chat', content: 'Legit link', notes: 'False alarm' } })).ok,
    true,
  );

  fs.rmSync(tmpFile, { force: true });
});
