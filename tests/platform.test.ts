import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RuleBasedAutoModEngine } from '../apps/bot/src/services/automod.ts';
import { SLASH_COMMANDS, executeSlashCommand } from '../apps/bot/src/commands/registry.ts';
import { PersistentTaskScheduler } from '../apps/bot/src/services/scheduler.ts';
import { evaluateXpAward } from '../apps/bot/src/services/xp.ts';
import { LocalPersistentAdapter } from '../packages/database/src/adapter.ts';
import { createInitialGuildSeed } from '../packages/database/src/seed.ts';
import {
  BASE_TRANSLATION_KEYS,
  calculateCompleteness,
  createLanguageDraft,
  previewLanguageChannels,
} from '../packages/localization/src/engine.ts';
import {
  canActOnTargetRank,
  mergeIndependentLanguageRoles,
} from '../packages/permissions/src/hierarchy.ts';

test('Permissions hierarchy blocks moderating equal or higher clan ranks and keeps languages independent', () => {
  assert.equal(canActOnTargetRank('Warlord', 'Recruit'), true);
  assert.equal(canActOnTargetRank('Warlord', 'Warlord'), false);
  assert.equal(canActOnTargetRank('Warlord', 'Shadow King'), false);
  assert.equal(canActOnTargetRank('Shadow King', 'Shadow Council'), true);

  const merged = mergeIndependentLanguageRoles(['en', 'sv'], ['en', 'ru'], ['en', 'ru']);
  assert.deepEqual(merged, ['en', 'ru', 'sv']);
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
    userRoles: ['Recruit'],
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
    userRoles: ['Shadow King'],
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

  // Rapid burst within cooldown
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

test('All required slash commands exist and /roles publish executes safely', async () => {
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
    actorRank: 'Shadow King',
    locale: 'en',
    channelName: 'role-selection',
    args: { panelId: 'panel-languages' },
    db,
  });
  assert.equal(res.ok, true);
  fs.rmSync(tmpFile, { force: true });
});
