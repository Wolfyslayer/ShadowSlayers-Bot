import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FirestoreDatabaseAdapter,
  type FirestoreClientLike,
  type FirestoreCollectionRefLike,
  type FirestoreDocRefLike,
  type FirestoreDocSnapshotLike,
  type FirestoreQueryLike,
  type FirestoreTransactionLike,
} from '../packages/database/src/firestore-adapter.ts';
import { createDatabaseAdapter } from '../packages/database/src/adapter.ts';
import { createInitialGuildSeed } from '../packages/database/src/seed.ts';
import type { BotControlCommand } from '../packages/shared/src/bot-control.ts';
import type { GuildState } from '../packages/shared/src/types.ts';

function createInMemoryFirestoreClient(opts?: { failTransientCount?: number; fatalErrorCode?: string }): {
  client: FirestoreClientLike;
  store: Map<string, Record<string, unknown>>;
  getAttempts: () => number;
} {
  const store = new Map<string, Record<string, unknown>>();
  let transientLeft = opts?.failTransientCount ?? 0;
  let attempts = 0;

  const maybeFail = () => {
    attempts += 1;
    if (opts?.fatalErrorCode) {
      const err = new Error(`Firestore fatal error: ${opts.fatalErrorCode}`) as Error & { code: string };
      err.code = opts.fatalErrorCode;
      throw err;
    }
    if (transientLeft > 0) {
      transientLeft -= 1;
      const err = new Error('14 UNAVAILABLE: Temporary upstream disconnect') as Error & { code: string };
      err.code = 'unavailable';
      throw err;
    }
  };

  const makeSnap = (id: string, data: Record<string, unknown> | undefined): FirestoreDocSnapshotLike => ({
    exists: data !== undefined,
    id,
    data: () => (data ? structuredClone(data) : undefined),
  });

  const makeQuery = (
    prefix: string,
    filters: Array<{ field: string; op: string; value: unknown }> = [],
    orderField?: string,
    orderDir: 'asc' | 'desc' = 'asc',
    limitCount?: number,
  ): FirestoreQueryLike => ({
    where: (field, op, value) => makeQuery(prefix, [...filters, { field, op, value }], orderField, orderDir, limitCount),
    orderBy: (field, direction = 'asc') => makeQuery(prefix, filters, field, direction, limitCount),
    limit: (n) => makeQuery(prefix, filters, orderField, orderDir, n),
    get: async () => {
      maybeFail();
      const depth = prefix.split('/').length + 1;
      let docs: FirestoreDocSnapshotLike[] = [];
      for (const [k, v] of store.entries()) {
        const parts = k.split('/');
        if (k.startsWith(`${prefix}/`) && parts.length === depth) {
          const id = parts[parts.length - 1];
          const matches = filters.every((f) => {
            const actual = v[f.field];
            if (f.op === '==') return actual === f.value;
            if (typeof actual === 'string' && typeof f.value === 'string') {
              if (f.op === '<') return actual < f.value;
              if (f.op === '<=') return actual <= f.value;
              if (f.op === '>') return actual > f.value;
              if (f.op === '>=') return actual >= f.value;
            }
            if (typeof actual === 'number' && typeof f.value === 'number') {
              if (f.op === '<') return actual < f.value;
              if (f.op === '<=') return actual <= f.value;
              if (f.op === '>') return actual > f.value;
              if (f.op === '>=') return actual >= f.value;
            }
            return false;
          });
          if (matches) docs.push(makeSnap(id, v));
        }
      }
      if (orderField) {
        docs.sort((a, b) => {
          const av = String(a.data()?.[orderField] ?? '');
          const bv = String(b.data()?.[orderField] ?? '');
          return orderDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
        });
      }
      if (typeof limitCount === 'number') {
        docs = docs.slice(0, limitCount);
      }
      return { docs };
    },
  });

  const makeCollection = (prefix: string): FirestoreCollectionRefLike => ({
    doc: (id: string): FirestoreDocRefLike => {
      const fullPath = `${prefix}/${id}`;
      return {
        id,
        path: fullPath,
        get: async () => {
          maybeFail();
          return makeSnap(id, store.get(fullPath));
        },
        set: async (data, options) => {
          maybeFail();
          const prev = options?.merge ? store.get(fullPath) ?? {} : {};
          store.set(fullPath, structuredClone({ ...prev, ...data }));
        },
        delete: async () => {
          maybeFail();
          store.delete(fullPath);
        },
        collection: (sub: string) => makeCollection(`${fullPath}/${sub}`),
      };
    },
    get: () => makeQuery(prefix).get(),
    where: (f, op, v) => makeQuery(prefix, [{ field: f, op, value: v }]),
    orderBy: (f, dir) => makeQuery(prefix, [], f, dir),
    limit: (n) => makeQuery(prefix, [], undefined, 'asc', n),
  });

  const client: FirestoreClientLike = {
    collection: (name: string) => makeCollection(name),
    runTransaction: async <T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T> => {
      maybeFail();
      const pendingWrites = new Map<string, { type: 'set' | 'delete'; data?: Record<string, unknown>; merge?: boolean }>();
      const tx: FirestoreTransactionLike = {
        get: async (ref) => makeSnap(ref.id, store.get(ref.path)),
        set: (ref, data, options) => {
          pendingWrites.set(ref.path, { type: 'set', data: structuredClone(data), merge: options?.merge });
        },
        delete: (ref) => {
          pendingWrites.set(ref.path, { type: 'delete' });
        },
      };
      const result = await fn(tx);
      for (const [p, op] of pendingWrites.entries()) {
        if (op.type === 'delete') {
          store.delete(p);
        } else if (op.data) {
          const prev = op.merge ? store.get(p) ?? {} : {};
          store.set(p, { ...prev, ...op.data });
        }
      }
      return result;
    },
  };

  return { client, store, getAttempts: () => attempts };
}

test('FirestoreDatabaseAdapter initializes meta + default guild, isolates guilds, and persists audit logs & tasks', async () => {
  const { client } = createInMemoryFirestoreClient();
  const adapter = new FirestoreDatabaseAdapter({
    client,
    defaultGuildId: 'guild-alpha',
    retryBaseDelayMs: 1,
  });

  await adapter.init();
  assert.equal(adapter.isConnected(), true);
  assert.deepEqual(await adapter.listGuildIds(), ['guild-alpha']);

  const alpha = await adapter.getGuild('guild-alpha');
  assert.ok(alpha);
  assert.equal(alpha.guildId, 'guild-alpha');
  assert.deepEqual(alpha.members, []);
  assert.deepEqual(alpha.logs, []);

  // Save second guild independently and verify strict guild isolation
  const beta = createInitialGuildSeed('guild-beta', 'Beta Citadel');
  await adapter.saveGuild(beta);
  const guildIds = await adapter.listGuildIds();
  assert.deepEqual(guildIds.sort(), ['guild-alpha', 'guild-beta']);

  await adapter.appendAuditLog('guild-alpha', {
    id: 'log-alpha-custom',
    guildId: 'guild-alpha',
    category: 'moderation',
    actorId: 'u-101',
    actorName: 'AldricShadow',
    targetId: 'u-105',
    targetName: 'DravenAsh',
    summary: 'Alpha-only audit log entry',
    details: {},
    createdAt: new Date().toISOString(),
  });

  const alphaAfter = await adapter.getGuild('guild-alpha');
  const betaAfter = await adapter.getGuild('guild-beta');
  assert.ok(alphaAfter?.logs.some((l) => l.id === 'log-alpha-custom'));
  assert.equal(betaAfter?.logs.some((l) => l.id === 'log-alpha-custom'), false);
});

test('Firestore log retention deletes expired subcollection entries in pages and respects guild settings', async () => {
  const { client, store } = createInMemoryFirestoreClient();
  const adapter = new FirestoreDatabaseAdapter({
    client,
    defaultGuildId: 'guild-retention-alpha',
    retryBaseDelayMs: 1,
  });
  await adapter.init();

  const beta = createInitialGuildSeed('guild-retention-beta');
  beta.logging.retentionDays = 30;
  await adapter.saveGuild(beta);

  const nowMs = Date.now();
  const daysAgo = (days: number) => new Date(nowMs - days * 86400_000).toISOString();
  for (let i = 0; i < 501; i += 1) {
    store.set(`guilds/guild-retention-alpha/logs/expired-alpha-${i}`, {
      createdAt: daysAgo(100),
    });
  }
  store.set('guilds/guild-retention-alpha/logs/retained-alpha', { createdAt: daysAgo(80) });
  store.set('guilds/guild-retention-beta/logs/expired-beta', { createdAt: daysAgo(31) });
  store.set('guilds/guild-retention-beta/logs/retained-beta', { createdAt: daysAgo(29) });

  const removed = await adapter.pruneExpiredAuditLogs(new Date(nowMs).toISOString());

  assert.equal(removed, 502);
  assert.equal(store.has('guilds/guild-retention-alpha/logs/expired-alpha-0'), false);
  assert.equal(store.has('guilds/guild-retention-alpha/logs/expired-alpha-500'), false);
  assert.equal(store.has('guilds/guild-retention-alpha/logs/retained-alpha'), true);
  assert.equal(store.has('guilds/guild-retention-beta/logs/expired-beta'), false);
  assert.equal(store.has('guilds/guild-retention-beta/logs/retained-beta'), true);
});

test('Firestore personal-data deletion is guild-scoped and anonymizes logs and bot commands', async () => {
  const { client, store } = createInMemoryFirestoreClient();
  const adapter = new FirestoreDatabaseAdapter({
    client,
    defaultGuildId: 'guild-privacy-alpha',
    retryBaseDelayMs: 1,
  });
  await adapter.init();

  const userId = '12345678901234567';
  const alpha = await adapter.getGuild('guild-privacy-alpha');
  assert.ok(alpha);
  alpha.members = [{ ...alpha.members[0], userId }];
  alpha.reminders = [
    {
      id: 'privacy-reminder',
      userId,
      username: 'PrivacyUser',
      channelName: 'general',
      message: 'Personal reminder',
      remindAt: new Date().toISOString(),
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ];
  alpha.scheduledTasks = [
    {
      id: 'privacy-reminder-task',
      guildId: alpha.guildId,
      type: 'reminder',
      targetId: 'privacy-reminder',
      description: 'Personal reminder',
      runAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      lastError: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    },
  ];
  await adapter.saveGuild(alpha);

  const beta = createInitialGuildSeed('guild-privacy-beta');
  beta.members = [{ ...beta.members[0], userId }];
  await adapter.saveGuild(beta);

  await adapter.appendAuditLog('guild-privacy-alpha', {
    id: 'privacy-alpha-log',
    guildId: 'guild-privacy-alpha',
    category: 'moderation',
    actorId: userId,
    actorName: 'PrivacyUser',
    targetId: userId,
    targetName: 'PrivacyUser',
    summary: 'Personal activity',
    details: { userId },
    createdAt: new Date().toISOString(),
  });
  await adapter.appendAuditLog('guild-privacy-beta', {
    id: 'privacy-beta-log',
    guildId: 'guild-privacy-beta',
    category: 'moderation',
    actorId: userId,
    actorName: 'PrivacyUser',
    targetId: null,
    targetName: null,
    summary: 'Other guild activity',
    details: {},
    createdAt: new Date().toISOString(),
  });
  store.set('bot_control_commands/privacy-command', {
    id: 'privacy-command',
    guildId: 'guild-privacy-alpha',
    operation: 'moderation.execute',
    payload: { targetUserId: userId, reason: 'Personal reason' },
    actorUserId: userId,
    actorUsername: 'PrivacyUser',
    signature: 'signature',
    status: 'completed',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  store.set('bot_control_commands/privacy-queued-command', {
    id: 'privacy-queued-command',
    guildId: 'guild-privacy-alpha',
    operation: 'command.execute',
    payload: { actorUserId: userId, args: { value: 'private' } },
    actorUserId: userId,
    actorUsername: 'PrivacyUser',
    signature: 'queued-signature',
    status: 'queued',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await adapter.anonymizeGuildUserData('guild-privacy-alpha', userId);

  const alphaAfter = await adapter.getGuild('guild-privacy-alpha');
  const betaAfter = await adapter.getGuild('guild-privacy-beta');
  assert.ok(alphaAfter);
  assert.ok(betaAfter);
  assert.equal(alphaAfter.members.some((member) => member.userId === userId), false);
  assert.equal(alphaAfter.reminders.some((reminder) => reminder.userId === userId), false);
  assert.equal(betaAfter.members.some((member) => member.userId === userId), true);
  assert.equal(store.has('guilds/guild-privacy-alpha/scheduledTasks/privacy-reminder-task'), false);

  const alphaLog = store.get('guilds/guild-privacy-alpha/logs/privacy-alpha-log');
  const betaLog = store.get('guilds/guild-privacy-beta/logs/privacy-beta-log');
  assert.equal(alphaLog?.actorId, '');
  assert.equal(alphaLog?.targetId, null);
  assert.deepEqual(alphaLog?.details, {});
  assert.equal(betaLog?.actorId, userId);

  const command = store.get('bot_control_commands/privacy-command');
  assert.equal(command?.actorUserId, '');
  assert.equal(command?.status, 'completed');
  assert.deepEqual(command?.payload, {});
  const queuedCommand = store.get('bot_control_commands/privacy-queued-command');
  assert.equal(queuedCommand?.actorUserId, '');
  assert.equal(queuedCommand?.status, 'cancelled');
  assert.deepEqual(queuedCommand?.payload, {});
});

test('Firestore personal-data deletion waits for related processing commands before changing guild data', async () => {
  const { client, store } = createInMemoryFirestoreClient();
  const adapter = new FirestoreDatabaseAdapter({
    client,
    defaultGuildId: 'guild-privacy-processing',
    retryBaseDelayMs: 1,
  });
  await adapter.init();

  const userId = '12345678901234567';
  const guild = await adapter.getGuild('guild-privacy-processing');
  assert.ok(guild);
  guild.members = [{ ...guild.members[0], userId }];
  await adapter.saveGuild(guild);
  store.set('bot_control_commands/privacy-processing-command', {
    id: 'privacy-processing-command',
    guildId: 'guild-privacy-processing',
    operation: 'moderation.execute',
    payload: { targetUserId: userId },
    actorUserId: '22345678901234567',
    actorUsername: 'Moderator',
    signature: 'signature',
    status: 'processing',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await assert.rejects(
    adapter.anonymizeGuildUserData('guild-privacy-processing', userId),
    /related bot command is processing/,
  );
  const unchanged = await adapter.getGuild('guild-privacy-processing');
  assert.ok(unchanged?.members.some((member) => member.userId === userId));
});

test('Firestore bot-control queue atomically claims, completes, expires, and reports runtime status without a default guild', async () => {
  const { client, store } = createInMemoryFirestoreClient();
  const adapter = new FirestoreDatabaseAdapter({ client });
  await adapter.init();

  assert.deepEqual(await adapter.listGuildIds(), []);

  const command: BotControlCommand<'moderation.execute'> = {
    id: 'command-queue-001',
    guildId: 'guild-queue-1',
    operation: 'moderation.execute',
    payload: {
      action: 'timeout',
      targetUserId: '123456789012345678',
      reason: 'test',
      durationMinutes: 5,
      channelName: 'general',
    },
    actorUserId: '987654321098765432',
    actorUsername: 'moderator',
    signature: 'test-signature',
    status: 'queued',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T00:01:00.000Z',
  };
  await adapter.enqueueBotCommand(command);

  const firstClaim = await adapter.claimNextBotCommand(
    ['guild-queue-1'],
    'worker-one',
    '2026-01-01T00:00:01.000Z',
  );
  assert.equal(firstClaim?.id, command.id);
  assert.equal(firstClaim?.status, 'processing');
  assert.equal(firstClaim?.workerId, 'worker-one');
  assert.equal(
    await adapter.claimNextBotCommand(['guild-queue-1'], 'worker-two', '2026-01-01T00:00:02.000Z'),
    null,
  );
  assert.equal(
    await adapter.completeBotCommand('guild-queue-1', command.id, 'worker-two', { ok: true }, 'signature', '2026-01-01T00:00:03.000Z'),
    false,
  );
  assert.equal(
    await adapter.completeBotCommand('guild-queue-1', command.id, 'worker-one', { ok: true }, 'signature', '2026-01-01T00:00:03.000Z'),
    true,
  );
  assert.equal((await adapter.getBotCommand('guild-queue-1', command.id))?.status, 'completed');
  assert.equal(await adapter.getBotCommand('different-guild', command.id), null);

  const expired = { ...command, id: 'command-queue-expired', expiresAt: '2025-12-31T23:59:59.000Z' };
  await adapter.enqueueBotCommand(expired);
  assert.equal(
    await adapter.claimNextBotCommand(['guild-queue-1'], 'worker-one', '2026-01-01T00:00:01.000Z'),
    null,
  );
  assert.equal((await adapter.getBotCommand('guild-queue-1', expired.id))?.status, 'failed');

  const status = {
    connected: true,
    mode: 'live_gateway' as const,
    botTag: 'Bot#0001',
    guildCount: 1,
    guildIds: ['guild-queue-1'],
    lastError: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:05.000Z',
  };
  await adapter.setBotRuntimeStatus(status);
  assert.deepEqual(await adapter.getBotRuntimeStatus(), status);
  assert.ok(store.has('shadowslayers_meta/bot_runtime'));
});

test('FirestoreDatabaseAdapter concurrency: parallel saveGuild and updateTaskStatus never regress completed tasks', async () => {
  const { client } = createInMemoryFirestoreClient();
  const adapter = new FirestoreDatabaseAdapter({
    client,
    defaultGuildId: 'guild-conc',
    retryBaseDelayMs: 1,
  });
  await adapter.init();

  const guild = await adapter.getGuild('guild-conc');
  assert.ok(guild);
  const dueTaskId = 'task-conc-1';
  const pastIso = new Date(Date.now() - 30_000).toISOString();
  guild.scheduledTasks.push({
    id: dueTaskId,
    guildId: 'guild-conc',
    type: 'reminder',
    targetId: 'rem-conc',
    description: 'Concurrency test task',
    runAt: pastIso,
    status: 'pending',
    attempts: 0,
    lastError: null,
    completedAt: null,
    createdAt: pastIso,
  });
  await adapter.saveGuild(guild);

  const staleSnapshot = structuredClone(guild);
  staleSnapshot.guildName = 'Updated Citadel Name';

  // Complete task, then immediately save stale guild snapshot still showing task='pending'
  await Promise.all([
    adapter.updateTaskStatus('guild-conc', dueTaskId, {
      status: 'completed',
      attempts: 1,
      completedAt: new Date().toISOString(),
    }),
    adapter.saveGuild(staleSnapshot),
  ]);

  const reloaded = await adapter.getGuild('guild-conc');
  const reloadedTask = reloaded?.scheduledTasks.find((t) => t.id === dueTaskId);
  assert.equal(reloaded?.guildName, 'Updated Citadel Name');
  assert.equal(reloadedTask?.status, 'completed');
  const dueNow = await adapter.getPendingTasks(new Date().toISOString());
  assert.equal(dueNow.some((t) => t.id === dueTaskId), false);
});

test('FirestoreDatabaseAdapter retries transient errors, surfaces fatal errors, and migrates v1 guild docs', async () => {
  // 1. Transient outage recovery
  const transient = createInMemoryFirestoreClient({ failTransientCount: 2 });
  const retryingAdapter = new FirestoreDatabaseAdapter({
    client: transient.client,
    defaultGuildId: 'guild-retry',
    maxRetries: 3,
    retryBaseDelayMs: 1,
  });
  await retryingAdapter.init();
  assert.equal(retryingAdapter.isConnected(), true);
  assert.ok(transient.getAttempts() >= 3);

  // 2. Fatal error surfacing (permission-denied)
  const fatal = createInMemoryFirestoreClient({ fatalErrorCode: 'permission-denied' });
  const fatalAdapter = new FirestoreDatabaseAdapter({
    client: fatal.client,
    defaultGuildId: 'guild-fatal',
    maxRetries: 3,
    retryBaseDelayMs: 1,
  });
  await assert.rejects(() => fatalAdapter.init(), /permission-denied/);
  assert.equal(fatalAdapter.isConnected(), false);

  // 3. v1 -> v3 schema migration inside Firestore
  const mem = createInMemoryFirestoreClient();
  const v1Seed = createInitialGuildSeed('guild-legacy-fs') as GuildState;
  v1Seed.schemaVersion = 1;
  v1Seed.members[0].clanRank = 'Shadow King' as unknown as GuildState['members'][number]['clanRank'];
  v1Seed.members[1].clanRank = 'UnknownLegacyRank' as unknown as GuildState['members'][number]['clanRank'];
  mem.store.set('shadowslayers_meta/root', { schemaVersion: 1, adminAuth: null });
  mem.store.set('guilds/guild-legacy-fs', v1Seed as unknown as Record<string, unknown>);

  const migAdapter = new FirestoreDatabaseAdapter({
    client: mem.client,
    defaultGuildId: 'guild-legacy-fs',
    retryBaseDelayMs: 1,
  });
  await migAdapter.init();
  const upgraded = await migAdapter.getGuild('guild-legacy-fs');
  assert.equal(upgraded?.schemaVersion, 3);
  assert.equal(upgraded?.members[0].clanRank, '👑 Shadow King');
  assert.equal(upgraded?.members[1].clanRank, null);
});

test('Database factory supports platform credentials and rejects missing project configuration', () => {
  assert.throws(
    () => createDatabaseAdapter('firestore', '.data/test.json', 'shadowslayers-primary', 'development', null),
    /requires FIREBASE_PROJECT_ID and either service-account credentials or platform Application Default Credentials/,
  );
  assert.throws(
    () => createDatabaseAdapter('firestore', '.data/test.json', 'shadowslayers-primary', 'production', null),
    /FIREBASE_PROJECT_ID is not configured/,
  );
  assert.equal(
    createDatabaseAdapter(
      'firestore',
      '.data/test.json',
      'shadowslayers-primary',
      'production',
      { projectId: 'shadowslayers-test' },
    ).driverName,
    'firestore',
  );
  assert.throws(
    () => createDatabaseAdapter('supabase', '.data/test.json', 'shadowslayers-primary', 'development', null),
    /DATABASE_ADAPTER="supabase" is not implemented in this runtime/,
  );
});
