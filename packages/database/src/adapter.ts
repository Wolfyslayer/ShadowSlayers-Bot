import fs from 'fs';
import path from 'path';
import type { FirebaseAdminConfig } from '../../config/src/env.ts';
import type {
  AdminAuthRecord,
  AuditLogEntry,
  DatabaseRoot,
  GuildState,
  ScheduledTask,
} from '../../shared/src/types.ts';
import type { BotControlCommand, BotRuntimeSnapshot } from '../../shared/src/bot-control.ts';
import { CURRENT_SCHEMA_VERSION, createEmptyGuild } from './empty-guild.ts';
import { migrateDatabaseRoot } from '../../../database/schema-migrations.ts';
import { anonymizeGuildUserData } from '../../shared/src/guild-privacy.ts';
import { FirestoreDatabaseAdapter } from './firestore-adapter.ts';

export interface DatabaseAdapter {
  readonly driverName: 'local' | 'firestore' | 'supabase';
  init(): Promise<void>;
  getAdminAuth(): Promise<AdminAuthRecord | null>;
  setAdminAuth(record: AdminAuthRecord): Promise<void>;
  listGuildIds(): Promise<string[]>;
  getGuild(guildId: string): Promise<GuildState | null>;
  saveGuild(guild: GuildState): Promise<void>;
  appendAuditLog(guildId: string, entry: AuditLogEntry): Promise<void>;
  anonymizeGuildUserData(guildId: string, userId: string): Promise<void>;
  pruneExpiredAuditLogs(nowIso: string): Promise<number>;
  getPendingTasks(nowIso: string): Promise<ScheduledTask[]>;
  updateTaskStatus(guildId: string, taskId: string, patch: Partial<ScheduledTask>): Promise<void>;
  enqueueBotCommand(command: BotControlCommand): Promise<void>;
  getBotCommand(guildId: string, commandId: string): Promise<BotControlCommand | null>;
  claimNextBotCommand(guildIds: string[], workerId: string, nowIso: string): Promise<BotControlCommand | null>;
  completeBotCommand(
    guildId: string,
    commandId: string,
    workerId: string,
    result: unknown,
    resultSignature: string,
    nowIso: string,
  ): Promise<boolean>;
  failBotCommand(guildId: string, commandId: string, workerId: string, error: string, nowIso: string): Promise<boolean>;
  cancelQueuedBotCommand(guildId: string, commandId: string, error: string, nowIso: string): Promise<boolean>;
  setBotRuntimeStatus(status: BotRuntimeSnapshot): Promise<void>;
  getBotRuntimeStatus(): Promise<BotRuntimeSnapshot | null>;
  exportSnapshot(): Promise<DatabaseRoot>;
  close?(): Promise<void>;
}

/**
 * Atomic file-backed persistent adapter for explicit local/development storage.
 * Implements the exact DatabaseAdapter interface with concurrency-safe merge guards
 * so concurrent log appends or task status transitions are never silently overwritten.
 */
export class LocalPersistentAdapter implements DatabaseAdapter {
  readonly driverName = 'local' as const;
  private readonly filePath: string;
  private state: DatabaseRoot;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = '.data/shadowslayers-db.json', defaultGuildId?: string | null) {
    this.filePath = path.resolve(process.cwd(), filePath);
    this.state = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      adminAuth: null,
      guilds: defaultGuildId ? { [defaultGuildId]: createEmptyGuild(defaultGuildId, defaultGuildId) } : {},
    };
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseRoot;
      this.state = migrateDatabaseRoot(parsed);
      await this.flush();
    } else {
      await this.flush();
    }
  }

  private flush(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => {
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    });
    return this.writeQueue;
  }

  async getAdminAuth(): Promise<AdminAuthRecord | null> {
    return this.state.adminAuth ? { ...this.state.adminAuth } : null;
  }

  async setAdminAuth(record: AdminAuthRecord): Promise<void> {
    this.state.adminAuth = { ...record };
    await this.flush();
  }

  async listGuildIds(): Promise<string[]> {
    return Object.keys(this.state.guilds);
  }

  async getGuild(guildId: string): Promise<GuildState | null> {
    const guild = this.state.guilds[guildId];
    return guild ? structuredClone(guild) : null;
  }

  async saveGuild(guild: GuildState): Promise<void> {
    const existing = this.state.guilds[guild.guildId];
    const next = structuredClone(guild);

    if (existing) {
      // Preserve concurrent audit logs and progressed scheduled task statuses
      const seenLogIds = new Set(next.logs.map((l) => l.id));
      const newerExistingLogs = existing.logs.filter((l) => !seenLogIds.has(l.id));
      if (newerExistingLogs.length > 0) {
        next.logs = [...newerExistingLogs, ...next.logs]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 1500);
      }

      const existingTaskMap = new Map(existing.scheduledTasks.map((t) => [t.id, t]));
      next.scheduledTasks = next.scheduledTasks.map((t) => {
        const live = existingTaskMap.get(t.id);
        if (
          live &&
          ((live.status === 'completed' && t.status !== 'completed') ||
            (live.status === 'running' && t.status === 'pending'))
        ) {
          return structuredClone(live);
        }
        return t;
      });
    }

    next.updatedAt = new Date().toISOString();
    this.state.guilds[next.guildId] = next;
    await this.flush();
  }

  async appendAuditLog(guildId: string, entry: AuditLogEntry): Promise<void> {
    const guild = this.state.guilds[guildId];
    if (!guild) throw new Error(`[Database] Cannot append audit log: guild "${guildId}" does not exist.`);
    guild.logs.unshift(entry);
    const cutoff = Date.now() - guild.logging.retentionDays * 86400_000;
    guild.logs = guild.logs
      .filter((l) => new Date(l.createdAt).getTime() >= cutoff)
      .slice(0, 1500);
    guild.updatedAt = new Date().toISOString();
    await this.flush();
  }

  async anonymizeGuildUserData(guildId: string, userId: string): Promise<void> {
    const guild = this.state.guilds[guildId];
    if (!guild) throw new Error(`[Database] Cannot anonymize user data: guild "${guildId}" does not exist.`);
    this.state.guilds[guildId] = {
      ...anonymizeGuildUserData(guild, userId),
      updatedAt: new Date().toISOString(),
    };
    await this.flush();
  }

  async pruneExpiredAuditLogs(nowIso: string): Promise<number> {
    const nowMs = Date.parse(nowIso);
    if (!Number.isFinite(nowMs)) {
      throw new Error(`[Database] Cannot prune audit logs: invalid reference time "${nowIso}".`);
    }

    let removed = 0;
    for (const guild of Object.values(this.state.guilds)) {
      const retentionDays = guild.logging?.retentionDays;
      if (typeof retentionDays !== 'number' || !Number.isFinite(retentionDays) || retentionDays < 0) {
        throw new Error(`[Database] Cannot prune audit logs: invalid retentionDays for guild "${guild.guildId}".`);
      }

      const cutoffMs = nowMs - retentionDays * 86400_000;
      const keptLogs = guild.logs.filter((log) => Date.parse(log.createdAt) >= cutoffMs);
      const removedFromGuild = guild.logs.length - keptLogs.length;
      if (removedFromGuild === 0) continue;

      guild.logs = keptLogs;
      guild.updatedAt = new Date(nowMs).toISOString();
      removed += removedFromGuild;
    }

    if (removed > 0) await this.flush();
    return removed;
  }

  async getPendingTasks(nowIso: string): Promise<ScheduledTask[]> {
    const nowMs = new Date(nowIso).getTime();
    const due: ScheduledTask[] = [];
    for (const guild of Object.values(this.state.guilds)) {
      for (const task of guild.scheduledTasks) {
        if (task.status === 'pending' && new Date(task.runAt).getTime() <= nowMs) {
          due.push({ ...task });
        }
      }
    }
    return due;
  }

  async updateTaskStatus(guildId: string, taskId: string, patch: Partial<ScheduledTask>): Promise<void> {
    const guild = this.state.guilds[guildId];
    if (!guild) throw new Error(`[Database] Cannot update scheduled task: guild "${guildId}" does not exist.`);
    const task = guild.scheduledTasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`[Database] Cannot update scheduled task "${taskId}": task does not exist.`);
    if (task.status === 'completed' && patch.status && patch.status !== 'completed') {
      return;
    }
    Object.assign(task, patch);
    guild.updatedAt = new Date().toISOString();
    await this.flush();
  }

  async enqueueBotCommand(): Promise<void> {
    throw new Error('[Database] API-to-bot commands require DATABASE_ADAPTER=firestore shared by both processes.');
  }

  async getBotCommand(): Promise<BotControlCommand | null> {
    throw new Error('[Database] API-to-bot commands require DATABASE_ADAPTER=firestore shared by both processes.');
  }

  async claimNextBotCommand(): Promise<BotControlCommand | null> {
    throw new Error('[Database] API-to-bot commands require DATABASE_ADAPTER=firestore shared by both processes.');
  }

  async completeBotCommand(): Promise<boolean> {
    throw new Error('[Database] API-to-bot commands require DATABASE_ADAPTER=firestore shared by both processes.');
  }

  async failBotCommand(): Promise<boolean> {
    throw new Error('[Database] API-to-bot commands require DATABASE_ADAPTER=firestore shared by both processes.');
  }

  async cancelQueuedBotCommand(): Promise<boolean> {
    throw new Error('[Database] API-to-bot commands require DATABASE_ADAPTER=firestore shared by both processes.');
  }

  async setBotRuntimeStatus(): Promise<void> {
    throw new Error('[Database] Shared bot runtime status requires DATABASE_ADAPTER=firestore.');
  }

  async getBotRuntimeStatus(): Promise<BotRuntimeSnapshot | null> {
    return null;
  }

  async exportSnapshot(): Promise<DatabaseRoot> {
    return structuredClone(this.state);
  }

  async close(): Promise<void> {
    await this.writeQueue;
  }
}

export function createDatabaseAdapter(
  adapterType: 'local' | 'firestore' | 'supabase',
  localDbPath: string,
  defaultGuildId: string | undefined,
  nodeEnv = process.env.NODE_ENV || 'development',
  firebaseConfig: FirebaseAdminConfig | null = null,
): DatabaseAdapter {
  if (adapterType === 'firestore') {
    if (!firebaseConfig) {
      if (nodeEnv === 'production') {
        throw new Error(
          `[Database] Production startup aborted: DATABASE_ADAPTER="firestore" was selected, ` +
            `but FIREBASE_PROJECT_ID is not configured. ` +
            `Silent fallback to local JSON storage is forbidden in production.`,
        );
      }
      throw new Error(
        `[Database] DATABASE_ADAPTER="firestore" requires FIREBASE_PROJECT_ID and either service-account credentials or platform Application Default Credentials. ` +
          `Set DATABASE_ADAPTER=local for explicit local development mode.`,
      );
    }
    return new FirestoreDatabaseAdapter({ firebaseConfig, defaultGuildId });
  }

  if (adapterType === 'supabase') {
    throw new Error(
      `[Database] Startup aborted: DATABASE_ADAPTER="supabase" is not implemented in this runtime (only a documented future fallback). ` +
        `Silent fallback to local JSON storage is forbidden. Use DATABASE_ADAPTER=firestore with Firebase Admin credentials or DATABASE_ADAPTER=local for local development.`,
    );
  }

  return new LocalPersistentAdapter(localDbPath, defaultGuildId);
}
