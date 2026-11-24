import { applicationDefault, cert, deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { FirebaseAdminConfig } from '../../config/src/env.ts';
import type {
  AdminAuthRecord,
  AuditLogEntry,
  DatabaseRoot,
  GuildState,
  ScheduledTask,
} from '../../shared/src/types.ts';
import type { BotControlCommand, BotRuntimeSnapshot } from '../../shared/src/bot-control.ts';
import { anonymizeGuildUserData } from '../../shared/src/guild-privacy.ts';
import { safeIdSchema } from '../../shared/src/validation.ts';
import { migrateDatabaseRoot } from '../../../database/schema-migrations.ts';
import type { DatabaseAdapter } from './adapter.ts';
import { CURRENT_SCHEMA_VERSION, createInitialGuildSeed } from './seed.ts';

export interface FirestoreDocSnapshotLike {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}

export interface FirestoreQuerySnapshotLike {
  docs: FirestoreDocSnapshotLike[];
}

export interface FirestoreDocRefLike {
  id: string;
  path: string;
  get(): Promise<FirestoreDocSnapshotLike>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  delete(): Promise<unknown>;
  collection(name: string): FirestoreCollectionRefLike;
}

export interface FirestoreCollectionRefLike {
  doc(id: string): FirestoreDocRefLike;
  get(): Promise<FirestoreQuerySnapshotLike>;
  where(field: string, opStr: '==' | '<=' | '<' | '>=' | '>', value: unknown): FirestoreQueryLike;
  orderBy(field: string, direction?: 'asc' | 'desc'): FirestoreQueryLike;
  limit(n: number): FirestoreQueryLike;
}

export interface FirestoreQueryLike {
  where(field: string, opStr: '==' | '<=' | '<' | '>=' | '>', value: unknown): FirestoreQueryLike;
  orderBy(field: string, direction?: 'asc' | 'desc'): FirestoreQueryLike;
  limit(n: number): FirestoreQueryLike;
  get(): Promise<FirestoreQuerySnapshotLike>;
}

export interface FirestoreTransactionLike {
  get(ref: FirestoreDocRefLike): Promise<FirestoreDocSnapshotLike>;
  set(ref: FirestoreDocRefLike, data: Record<string, unknown>, options?: { merge?: boolean }): void;
  delete(ref: FirestoreDocRefLike): void;
}

export interface FirestoreClientLike {
  collection(name: string): FirestoreCollectionRefLike;
  runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T>;
}

const TRANSIENT_ERROR_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'aborted',
  'resource-exhausted',
  'internal',
  '10',
  '14',
  '4',
  '8',
  '13',
]);

function isTransientFirestoreError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code ?? '').toLowerCase();
  const msg = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return (
    TRANSIENT_ERROR_CODES.has(code) ||
    msg.includes('unavailable') ||
    msg.includes('deadline exceeded') ||
    msg.includes('aborted') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function assertSafeDocId(id: string, label: string): string {
  const parsed = safeIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new Error(`[Firestore] Invalid ${label} identifier: "${id}"`);
  }
  return parsed.data;
}

function containsUserId(value: unknown, userId: string): boolean {
  if (value === userId) return true;
  if (Array.isArray(value)) return value.some((entry) => containsUserId(entry, userId));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((entry) => containsUserId(entry, userId));
  }
  return false;
}

export interface FirestoreAdapterOptions {
  firebaseConfig?: FirebaseAdminConfig | null;
  defaultGuildId?: string | null;
  client?: FirestoreClientLike;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

/**
 * Production Firestore DatabaseAdapter backed by Firebase Admin SDK (server-side only).
 * - Never exposes or reads credentials in browser code.
 * - Isolates every guild under `guilds/{guildId}` with subcollections `logs` and `scheduledTasks`.
 * - Uses Firestore transactions and per-guild async locks so concurrent writes never clobber tasks or logs.
 * - Retries transient network/contention failures and surfaces fatal auth/permission errors explicitly.
 */
export class FirestoreDatabaseAdapter implements DatabaseAdapter {
  readonly driverName = 'firestore' as const;
  private readonly firebaseConfig: FirebaseAdminConfig | null;
  private readonly defaultGuildId: string | null;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private client: FirestoreClientLike | null;
  private app: App | null = null;
  private readonly guildLocks = new Map<string, Promise<void>>();
  private connected = false;

  constructor(options: FirestoreAdapterOptions) {
    this.firebaseConfig = options.firebaseConfig ?? null;
    this.defaultGuildId = options.defaultGuildId ?? null;
    this.client = options.client ?? null;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 120;

    if (!this.client && !this.firebaseConfig) {
      throw new Error(
        '[Database] FirestoreDatabaseAdapter requires FIREBASE_PROJECT_ID and server-side Application Default Credentials or service-account credentials.',
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    if (this.app) {
      await deleteApp(this.app);
      this.app = null;
      this.client = null;
    }
    this.connected = false;
  }

  private getClient(): FirestoreClientLike {
    if (this.client) return this.client;
    if (!this.firebaseConfig) {
      throw new Error('[Firestore] Missing Firebase Admin SDK configuration.');
    }
    const appName = `shadowslayers-firestore-${this.firebaseConfig.projectId}`;
    const credential =
      this.firebaseConfig.clientEmail && this.firebaseConfig.privateKey
        ? cert({
            projectId: this.firebaseConfig.projectId,
            clientEmail: this.firebaseConfig.clientEmail,
            privateKey: this.firebaseConfig.privateKey,
          })
        : applicationDefault();
    const existingApp = getApps().find((a) => a.name === appName);
    this.app =
      existingApp ??
      initializeApp(
        {
          credential,
          projectId: this.firebaseConfig.projectId,
        },
        appName,
      );
    const fsDb: Firestore = getFirestore(this.app);
    try {
      fsDb.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings() may only be called once per Firestore instance before use
    }
    this.client = fsDb as unknown as FirestoreClientLike;
    return this.client;
  }

  private async withRetry<T>(operationName: string, fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn();
        this.connected = true;
        return result;
      } catch (err) {
        lastError = err;
        if (!isTransientFirestoreError(err) || attempt === this.maxRetries) {
          this.connected = false;
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`[Firestore:${operationName}] ${message}`);
        }
        const delay = this.retryBaseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private async withGuildLock<T>(guildId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.guildLocks.get(guildId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = prev.then(() => gate);
    this.guildLocks.set(guildId, queued);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.guildLocks.get(guildId) === queued) {
        this.guildLocks.delete(guildId);
      }
    }
  }

  async init(): Promise<void> {
    const guildId = this.defaultGuildId ? assertSafeDocId(this.defaultGuildId, 'defaultGuildId') : null;
    const db = this.getClient();

    await this.withRetry('init', async () => {
      const metaRef = db.collection('shadowslayers_meta').doc('root');
      const guildCol = db.collection('guilds');

      await db.runTransaction(async (tx) => {
        const metaSnap = await tx.get(metaRef);
        const defaultGuildRef = guildId ? guildCol.doc(guildId) : null;
        const defaultGuildSnap = defaultGuildRef ? await tx.get(defaultGuildRef) : null;

        if (!metaSnap.exists) {
          tx.set(metaRef, {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            adminAuth: null,
            updatedAt: new Date().toISOString(),
          });
        }

        if (guildId && defaultGuildRef && !defaultGuildSnap?.exists) {
          const seed = createInitialGuildSeed(guildId);
          await this.writeGuildInsideTransaction(tx, defaultGuildRef, seed, undefined, true);
        }
      });

      // Check existing guilds for schema upgrades outside the initial bootstrap tx
      const allGuildsSnap = await guildCol.get();
      for (const docSnap of allGuildsSnap.docs) {
        const rawGuild = docSnap.data() as unknown as GuildState | undefined;
        if (!rawGuild) continue;
        if ((rawGuild.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION) {
          const root: DatabaseRoot = {
            schemaVersion: rawGuild.schemaVersion ?? 1,
            adminAuth: null,
            guilds: { [docSnap.id]: rawGuild },
          };
          const migrated = migrateDatabaseRoot(root);
          const upgraded = migrated.guilds[docSnap.id];
          if (upgraded) {
            await this.saveGuild(upgraded);
          }
        }
      }
    });
  }

  private async writeGuildInsideTransaction(
    tx: FirestoreTransactionLike,
    guildRef: FirestoreDocRefLike,
    guild: GuildState,
    existingDocData?: Record<string, unknown>,
    seedSubcollections = false,
  ): Promise<void> {
    const now = new Date().toISOString();
    const prevRevision = typeof existingDocData?._revision === 'number' ? existingDocData._revision : 0;

    // Persist audit logs in subcollection `guilds/{guildId}/logs` (avoid 1MB document bloat & write contention)
    const { logs, scheduledTasks, ...guildWithoutSubcollections } = guild;
    const payload = stripUndefined({
      ...guildWithoutSubcollections,
      logs: [],
      scheduledTasks: scheduledTasks ?? [],
      updatedAt: now,
      _revision: prevRevision + 1,
    }) as Record<string, unknown>;

    tx.set(guildRef, payload);

    // Sync scheduled tasks into subcollection `guilds/{guildId}/scheduledTasks`
    const taskCol = guildRef.collection('scheduledTasks');
    for (const task of scheduledTasks ?? []) {
      const safeTaskId = assertSafeDocId(task.id, 'taskId');
      tx.set(taskCol.doc(safeTaskId), stripUndefined(task) as unknown as Record<string, unknown>);
    }

    if (seedSubcollections && Array.isArray(logs) && logs.length > 0) {
      const logCol = guildRef.collection('logs');
      for (const entry of logs.slice(0, 100)) {
        const safeLogId = assertSafeDocId(entry.id, 'logId');
        tx.set(logCol.doc(safeLogId), stripUndefined(entry) as unknown as Record<string, unknown>);
      }
    }
  }

  async getAdminAuth(): Promise<AdminAuthRecord | null> {
    const db = this.getClient();
    return this.withRetry('getAdminAuth', async () => {
      const snap = await db.collection('shadowslayers_meta').doc('root').get();
      if (!snap.exists) return null;
      const data = snap.data();
      const auth = data?.adminAuth as AdminAuthRecord | null | undefined;
      return auth ? structuredClone(auth) : null;
    });
  }

  async setAdminAuth(record: AdminAuthRecord): Promise<void> {
    const db = this.getClient();
    await this.withRetry('setAdminAuth', async () => {
      const metaRef = db.collection('shadowslayers_meta').doc('root');
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(metaRef);
        const existing = snap.exists ? snap.data() ?? {} : {};
        tx.set(metaRef, {
          ...existing,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          adminAuth: stripUndefined({ ...record }),
          updatedAt: new Date().toISOString(),
        });
      });
    });
  }

  async listGuildIds(): Promise<string[]> {
    const db = this.getClient();
    return this.withRetry('listGuildIds', async () => {
      const snap = await db.collection('guilds').get();
      return snap.docs.map((d) => d.id);
    });
  }

  async getGuild(guildId: string): Promise<GuildState | null> {
    const safeGuildId = assertSafeDocId(guildId, 'guildId');
    const db = this.getClient();
    return this.withRetry(`getGuild:${safeGuildId}`, async () => {
      const guildRef = db.collection('guilds').doc(safeGuildId);
      const snap = await guildRef.get();
      if (!snap.exists) return null;
      const raw = snap.data() as unknown as GuildState;

      const [logsSnap, tasksSnap] = await Promise.all([
        guildRef.collection('logs').orderBy('createdAt', 'desc').limit(500).get(),
        guildRef.collection('scheduledTasks').get(),
      ]);

      const subLogs = logsSnap.docs.map((d) => d.data() as unknown as AuditLogEntry);
      const subTasks = tasksSnap.docs.map((d) => d.data() as unknown as ScheduledTask);

      const merged: GuildState = {
        ...raw,
        guildId: safeGuildId,
        logs: subLogs.length > 0 ? subLogs : (raw.logs ?? []),
        scheduledTasks: subTasks.length > 0 ? subTasks : (raw.scheduledTasks ?? []),
      };

      if ((merged.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION) {
        const migrated = migrateDatabaseRoot({
          schemaVersion: merged.schemaVersion ?? 1,
          adminAuth: null,
          guilds: { [safeGuildId]: merged },
        });
        return structuredClone(migrated.guilds[safeGuildId]);
      }
      return structuredClone(merged);
    });
  }

  async saveGuild(guild: GuildState): Promise<void> {
    const safeGuildId = assertSafeDocId(guild.guildId, 'guildId');
    const db = this.getClient();

    await this.withGuildLock(safeGuildId, async () => {
      await this.withRetry(`saveGuild:${safeGuildId}`, async () => {
        const guildRef = db.collection('guilds').doc(safeGuildId);
        const taskCol = guildRef.collection('scheduledTasks');

        await db.runTransaction(async (tx) => {
          const existingSnap = await tx.get(guildRef);
          const existingData = existingSnap.exists ? existingSnap.data() : undefined;

          // Read existing scheduled tasks inside transaction so concurrent updateTaskStatus cannot be overwritten
          const taskRefs = (guild.scheduledTasks ?? []).map((t) => ({
            task: t,
            ref: taskCol.doc(assertSafeDocId(t.id, 'taskId')),
          }));
          const existingTaskSnaps = await Promise.all(taskRefs.map((entry) => tx.get(entry.ref)));

          const reconciledTasks: ScheduledTask[] = taskRefs.map((entry, idx) => {
            const liveSnap = existingTaskSnaps[idx];
            if (liveSnap.exists) {
              const liveTask = liveSnap.data() as unknown as ScheduledTask;
              // Never regress a completed or running task back to pending from an older snapshot
              if (
                (liveTask.status === 'completed' && entry.task.status !== 'completed') ||
                (liveTask.status === 'running' && entry.task.status === 'pending')
              ) {
                return liveTask;
              }
            }
            return entry.task;
          });

          const guildToPersist: GuildState = {
            ...guild,
            guildId: safeGuildId,
            scheduledTasks: reconciledTasks,
          };

          await this.writeGuildInsideTransaction(
            tx,
            guildRef,
            guildToPersist,
            existingData,
            !existingSnap.exists,
          );
        });
      });
    });
  }

  async appendAuditLog(guildId: string, entry: AuditLogEntry): Promise<void> {
    const safeGuildId = assertSafeDocId(guildId, 'guildId');
    const safeLogId = assertSafeDocId(entry.id, 'logId');
    const db = this.getClient();

    await this.withRetry(`appendAuditLog:${safeGuildId}`, async () => {
      const guildRef = db.collection('guilds').doc(safeGuildId);
      const guildSnap = await guildRef.get();
      if (!guildSnap.exists) {
        throw new Error(`[Firestore] Cannot append audit log: guild "${safeGuildId}" does not exist.`);
      }

      const logRef = guildRef.collection('logs').doc(safeLogId);
      await logRef.set(
        stripUndefined({
          ...entry,
          guildId: safeGuildId,
        }) as Record<string, unknown>,
      );
    });
  }

  async anonymizeGuildUserData(guildId: string, userId: string): Promise<void> {
    const safeGuildId = assertSafeDocId(guildId, 'guildId');
    const safeUserId = assertSafeDocId(userId, 'userId');
    const db = this.getClient();
    const guild = await this.getGuild(safeGuildId);
    if (!guild) throw new Error(`[Firestore] Cannot anonymize user data: guild "${safeGuildId}" does not exist.`);

    const reminderIds = new Set(
      guild.reminders.filter((reminder) => reminder.userId === safeUserId).map((reminder) => reminder.id),
    );
    const temporaryRoleIds = new Set(
      guild.temporaryRoles.filter((grant) => grant.userId === safeUserId).map((grant) => grant.id),
    );
    const removedTaskIds = guild.scheduledTasks
      .filter(
        (task) =>
          (task.type === 'reminder' && reminderIds.has(task.targetId)) ||
          (task.type === 'temprole_expiry' && temporaryRoleIds.has(task.targetId)),
      )
      .map((task) => task.id);

    await this.anonymizeGuildBotCommands(safeGuildId, safeUserId);
    await this.saveGuild(anonymizeGuildUserData(guild, safeUserId));

    const taskCollection = db.collection('guilds').doc(safeGuildId).collection('scheduledTasks');
    await Promise.all(
      removedTaskIds.map((taskId) =>
        this.withRetry('anonymizeGuildUserData:deleteTask', () =>
          taskCollection.doc(assertSafeDocId(taskId, 'taskId')).delete(),
        ),
      ),
    );

    const logCollection = db.collection('guilds').doc(safeGuildId).collection('logs');
    const [actorLogs, targetLogs] = await this.withRetry('anonymizeGuildUserData:findLogs', () =>
      Promise.all([
        logCollection.where('actorId', '==', safeUserId).get(),
        logCollection.where('targetId', '==', safeUserId).get(),
      ]),
    );
    const affectedLogs = new Map<string, FirestoreDocSnapshotLike>();
    for (const log of [...actorLogs.docs, ...targetLogs.docs]) affectedLogs.set(log.id, log);

    const logEntries = [...affectedLogs.values()];
    for (let start = 0; start < logEntries.length; start += 100) {
      const batch = logEntries.slice(start, start + 100);
      await Promise.all(
        batch.map((log) =>
          this.withRetry('anonymizeGuildUserData:writeLog', async () => {
            const entry = log.data();
            if (!entry) return;
            const actorMatches = entry.actorId === safeUserId;
            const targetMatches = entry.targetId === safeUserId;
            await logCollection.doc(assertSafeDocId(log.id, 'logId')).set(
              stripUndefined({
                ...entry,
                actorId: actorMatches ? '' : entry.actorId,
                actorName: actorMatches ? 'Deleted user' : entry.actorName,
                targetId: targetMatches ? null : entry.targetId,
                targetName: targetMatches ? 'Deleted user' : entry.targetName,
                summary: 'Audit activity retained after personal identifiers were removed.',
                details: {},
              }),
            );
          }),
        ),
      );
    }
  }

  private async anonymizeGuildBotCommands(guildId: string, userId: string): Promise<void> {
    const db = this.getClient();
    const collection = db.collection('bot_control_commands');
    const commands = await this.withRetry('anonymizeGuildBotCommands:list', () =>
      collection.where('guildId', '==', guildId).get(),
    );
    const affected = commands.docs.filter((doc) => containsUserId(doc.data(), userId));
    if (affected.some((doc) => doc.data()?.status === 'processing')) {
      throw new Error('[Firestore] Cannot anonymize user data while a related bot command is processing.');
    }

    await Promise.all(
      affected.map((command) => {
        const ref = collection.doc(assertSafeDocId(command.id, 'botCommandId'));
        return this.withRetry('anonymizeGuildBotCommands:update', () =>
          db.runTransaction(async (tx) => {
            const currentSnap = await tx.get(ref);
            const current = currentSnap.data();
            if (!current || !containsUserId(current, userId)) return;
            if (current.status === 'processing') {
              throw new Error('[Firestore] Cannot anonymize user data while a related bot command is processing.');
            }

            const now = new Date().toISOString();
            tx.set(ref, {
              id: current.id ?? command.id,
              guildId,
              operation: current.operation ?? 'privacy.anonymized',
              payload: {},
              actorUserId: '',
              actorUsername: 'Deleted user',
              signature: '',
              status: current.status === 'queued' ? 'cancelled' : current.status,
              createdAt: current.createdAt ?? now,
              expiresAt: current.expiresAt ?? now,
              completedAt: current.status === 'queued' ? now : (current.completedAt ?? null),
              result: null,
              resultSignature: null,
              error: 'Command metadata anonymized after a personal-data deletion request.',
            });
          }),
        );
      }),
    );
  }

  async pruneExpiredAuditLogs(nowIso: string): Promise<number> {
    const nowMs = Date.parse(nowIso);
    if (!Number.isFinite(nowMs)) {
      throw new Error(`[Firestore] Cannot prune audit logs: invalid reference time "${nowIso}".`);
    }
    const db = this.getClient();

    return this.withRetry('pruneExpiredAuditLogs', async () => {
      const guildsSnap = await db.collection('guilds').get();
      let removed = 0;

      for (const guildDoc of guildsSnap.docs) {
        const guild = guildDoc.data();
        const logging = guild?.logging as { retentionDays?: unknown } | undefined;
        const retentionDays = logging?.retentionDays;
        if (typeof retentionDays !== 'number' || !Number.isFinite(retentionDays) || retentionDays < 0) {
          throw new Error(
            `[Firestore] Cannot prune audit logs: invalid retentionDays for guild "${guildDoc.id}".`,
          );
        }

        const cutoffIso = new Date(nowMs - retentionDays * 86400_000).toISOString();
        const logCollection = db
          .collection('guilds')
          .doc(assertSafeDocId(guildDoc.id, 'guildId'))
          .collection('logs');

        for (;;) {
          const expired = await logCollection.where('createdAt', '<', cutoffIso).limit(500).get();
          if (expired.docs.length === 0) break;

          for (let start = 0; start < expired.docs.length; start += 100) {
            const batch = expired.docs.slice(start, start + 100);
            await Promise.all(
              batch.map((doc) =>
                logCollection.doc(assertSafeDocId(doc.id, 'logId')).delete(),
              ),
            );
          }
          removed += expired.docs.length;
        }
      }

      return removed;
    });
  }

  async getPendingTasks(nowIso: string): Promise<ScheduledTask[]> {
    const db = this.getClient();
    const nowMs = new Date(nowIso).getTime();

    return this.withRetry('getPendingTasks', async () => {
      const guildsSnap = await db.collection('guilds').get();
      const due: ScheduledTask[] = [];
      for (const guildDoc of guildsSnap.docs) {
        const pendingSnap = await db
          .collection('guilds')
          .doc(guildDoc.id)
          .collection('scheduledTasks')
          .where('status', '==', 'pending')
          .get();

        for (const taskDoc of pendingSnap.docs) {
          const task = taskDoc.data() as unknown as ScheduledTask;
          if (task && task.status === 'pending' && new Date(task.runAt).getTime() <= nowMs) {
            due.push(structuredClone({ ...task, guildId: guildDoc.id }));
          }
        }
      }
      return due;
    });
  }

  async updateTaskStatus(guildId: string, taskId: string, patch: Partial<ScheduledTask>): Promise<void> {
    const safeGuildId = assertSafeDocId(guildId, 'guildId');
    const safeTaskId = assertSafeDocId(taskId, 'taskId');
    const db = this.getClient();

    await this.withGuildLock(safeGuildId, async () => {
      await this.withRetry(`updateTaskStatus:${safeGuildId}/${safeTaskId}`, async () => {
        const guildRef = db.collection('guilds').doc(safeGuildId);
        const taskRef = guildRef.collection('scheduledTasks').doc(safeTaskId);

        await db.runTransaction(async (tx) => {
          const [guildSnap, taskSnap] = await Promise.all([tx.get(guildRef), tx.get(taskRef)]);
          if (!guildSnap.exists) {
            throw new Error(`[Firestore] Cannot update scheduled task: guild "${safeGuildId}" does not exist.`);
          }

          const currentTask: ScheduledTask | undefined = taskSnap.exists
            ? (taskSnap.data() as unknown as ScheduledTask)
            : ((guildSnap.data()?.scheduledTasks as ScheduledTask[] | undefined) ?? []).find(
                (t) => t.id === safeTaskId,
              );

          if (!currentTask) {
            throw new Error(`[Firestore] Cannot update scheduled task "${safeTaskId}": task does not exist.`);
          }
          // Prevent downgrading an already completed task
          if (currentTask.status === 'completed' && patch.status && patch.status !== 'completed') {
            return;
          }

          const updatedTask: ScheduledTask = {
            ...currentTask,
            ...patch,
            id: safeTaskId,
            guildId: safeGuildId,
          };
          tx.set(taskRef, stripUndefined(updatedTask) as unknown as Record<string, unknown>);

          const guildData = guildSnap.data() as unknown as GuildState;
          const updatedList = (guildData.scheduledTasks ?? []).map((t) =>
            t.id === safeTaskId ? updatedTask : t,
          );
          tx.set(
            guildRef,
            stripUndefined({
              ...guildData,
              scheduledTasks: updatedList,
              updatedAt: new Date().toISOString(),
            }) as Record<string, unknown>,
          );
        });
      });
    });
  }

  private getBotCommandCollection(guildId: string): FirestoreCollectionRefLike {
    assertSafeDocId(guildId, 'guildId');
    return this.getClient().collection('bot_control_commands');
  }

  async enqueueBotCommand(command: BotControlCommand): Promise<void> {
    const safeId = assertSafeDocId(command.id, 'botCommandId');
    const collection = this.getBotCommandCollection(command.guildId);
    await this.withRetry('enqueueBotCommand', async () => {
      await collection.doc(safeId).set(stripUndefined(command) as unknown as Record<string, unknown>);
    });
  }

  async getBotCommand(guildId: string, commandId: string): Promise<BotControlCommand | null> {
    const safeId = assertSafeDocId(commandId, 'botCommandId');
    const collection = this.getBotCommandCollection(guildId);
    return this.withRetry('getBotCommand', async () => {
      const snap = await collection.doc(safeId).get();
      if (!snap.exists) return null;
      const command = snap.data() as unknown as BotControlCommand;
      return command.guildId === guildId ? structuredClone(command) : null;
    });
  }

  async claimNextBotCommand(
    guildIds: string[],
    workerId: string,
    nowIso: string,
  ): Promise<BotControlCommand | null> {
    const connectedGuildIds = new Set(guildIds.map((id) => assertSafeDocId(id, 'guildId')));
    if (connectedGuildIds.size === 0) return null;
    const collection = this.getClient().collection('bot_control_commands');
    const now = new Date(nowIso);
    if (Number.isNaN(now.getTime())) throw new Error('[Firestore] Invalid bot command claim timestamp.');

    return this.withRetry('claimNextBotCommand', async () => {
      const queued = await collection.where('status', '==', 'queued').limit(50).get();
      for (const candidate of queued.docs) {
        const ref = collection.doc(assertSafeDocId(candidate.id, 'botCommandId'));
        const claimed = await this.getClient().runTransaction(async (tx) => {
          const currentSnap = await tx.get(ref);
          if (!currentSnap.exists) return null;
          const current = currentSnap.data() as unknown as BotControlCommand;
          if (current.status !== 'queued') return null;
          const expiresAt = Date.parse(current.expiresAt);
          if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
            tx.set(
              ref,
              {
                status: 'failed',
                error: 'Bot command has an invalid or expired deadline.',
                completedAt: now.toISOString(),
              },
              { merge: true },
            );
            return null;
          }
          if (!connectedGuildIds.has(current.guildId)) return null;
          const next: BotControlCommand = {
            ...current,
            status: 'processing',
            workerId,
            claimedAt: now.toISOString(),
          };
          tx.set(ref, stripUndefined(next) as unknown as Record<string, unknown>);
          return next;
        });
        if (claimed) return claimed;
      }
      return null;
    });
  }

  private async transitionBotCommand(
    operation: string,
    guildId: string,
    commandId: string,
    workerId: string | null,
    expectedStatus: BotControlCommand['status'],
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    const collection = this.getBotCommandCollection(guildId);
    const ref = collection.doc(assertSafeDocId(commandId, 'botCommandId'));
    return this.withRetry(operation, async () =>
      this.getClient().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const current = snap.data() as Record<string, unknown> | undefined;
        if (current?.status !== expectedStatus) return false;
        if (current.guildId !== guildId) return false;
        if (workerId && current.workerId !== workerId) return false;
        tx.set(ref, stripUndefined(patch) as Record<string, unknown>, { merge: true });
        return true;
      }),
    );
  }

  async completeBotCommand(
    guildId: string,
    commandId: string,
    workerId: string,
    result: unknown,
    resultSignature: string,
    nowIso: string,
  ): Promise<boolean> {
    return this.transitionBotCommand('completeBotCommand', guildId, commandId, workerId, 'processing', {
      status: 'completed',
      result,
      resultSignature,
      completedAt: nowIso,
    });
  }

  async failBotCommand(
    guildId: string,
    commandId: string,
    workerId: string,
    error: string,
    nowIso: string,
  ): Promise<boolean> {
    return this.transitionBotCommand('failBotCommand', guildId, commandId, workerId, 'processing', {
      status: 'failed',
      error,
      completedAt: nowIso,
    });
  }

  async cancelQueuedBotCommand(
    guildId: string,
    commandId: string,
    error: string,
    nowIso: string,
  ): Promise<boolean> {
    return this.transitionBotCommand('cancelQueuedBotCommand', guildId, commandId, null, 'queued', {
      status: 'cancelled',
      error,
      completedAt: nowIso,
    });
  }

  async setBotRuntimeStatus(status: BotRuntimeSnapshot): Promise<void> {
    const db = this.getClient();
    await this.withRetry('setBotRuntimeStatus', async () => {
      await db
        .collection('shadowslayers_meta')
        .doc('bot_runtime')
        .set(stripUndefined(status) as unknown as Record<string, unknown>);
    });
  }

  async getBotRuntimeStatus(): Promise<BotRuntimeSnapshot | null> {
    const db = this.getClient();
    return this.withRetry('getBotRuntimeStatus', async () => {
      const snap = await db.collection('shadowslayers_meta').doc('bot_runtime').get();
      return snap.exists ? (structuredClone(snap.data()) as unknown as BotRuntimeSnapshot) : null;
    });
  }

  async exportSnapshot(): Promise<DatabaseRoot> {
    const db = this.getClient();
    return this.withRetry('exportSnapshot', async () => {
      const [adminAuth, guildIds] = await Promise.all([this.getAdminAuth(), this.listGuildIds()]);
      const guilds: Record<string, GuildState> = {};
      for (const gid of guildIds) {
        const g = await this.getGuild(gid);
        if (g) guilds[gid] = g;
      }
      const metaSnap = await db.collection('shadowslayers_meta').doc('root').get();
      const schemaVersion =
        typeof metaSnap.data()?.schemaVersion === 'number'
          ? (metaSnap.data()!.schemaVersion as number)
          : CURRENT_SCHEMA_VERSION;
      return {
        schemaVersion,
        adminAuth,
        guilds,
      };
    });
  }
}
