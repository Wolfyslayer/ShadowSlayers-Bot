import fs from 'fs';
import path from 'path';
import type {
  AdminAuthRecord,
  AuditLogEntry,
  DatabaseRoot,
  GuildState,
  ScheduledTask,
} from '../../shared/src/types.ts';
import { CURRENT_SCHEMA_VERSION, createInitialGuildSeed } from './seed.ts';
import { migrateDatabaseRoot } from '../../../database/schema-migrations.ts';

export interface DatabaseAdapter {
  readonly driverName: 'local' | 'firestore' | 'supabase';
  init(): Promise<void>;
  getAdminAuth(): Promise<AdminAuthRecord | null>;
  setAdminAuth(record: AdminAuthRecord): Promise<void>;
  listGuildIds(): Promise<string[]>;
  getGuild(guildId: string): Promise<GuildState | null>;
  saveGuild(guild: GuildState): Promise<void>;
  appendAuditLog(guildId: string, entry: AuditLogEntry): Promise<void>;
  getPendingTasks(nowIso: string): Promise<ScheduledTask[]>;
  updateTaskStatus(guildId: string, taskId: string, patch: Partial<ScheduledTask>): Promise<void>;
  exportSnapshot(): Promise<DatabaseRoot>;
}

/**
 * Atomic file-backed persistent adapter for preview, development, and self-contained Lunafy local storage.
 * Implements the exact DatabaseAdapter interface so Firestore or Supabase adapters can swap in cleanly.
 */
export class LocalPersistentAdapter implements DatabaseAdapter {
  readonly driverName = 'local' as const;
  private readonly filePath: string;
  private state: DatabaseRoot;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = '.data/shadowslayers-db.json', defaultGuildId = 'shadowslayers-primary') {
    this.filePath = path.resolve(process.cwd(), filePath);
    this.state = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      adminAuth: null,
      guilds: {
        [defaultGuildId]: createInitialGuildSeed(defaultGuildId),
      },
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
    guild.updatedAt = new Date().toISOString();
    this.state.guilds[guild.guildId] = structuredClone(guild);
    await this.flush();
  }

  async appendAuditLog(guildId: string, entry: AuditLogEntry): Promise<void> {
    const guild = this.state.guilds[guildId];
    if (!guild) return;
    guild.logs.unshift(entry);
    // Prune logs older than configured retentionDays
    const cutoff = Date.now() - guild.logging.retentionDays * 86400_000;
    guild.logs = guild.logs
      .filter((l) => new Date(l.createdAt).getTime() >= cutoff)
      .slice(0, 1500);
    guild.updatedAt = new Date().toISOString();
    await this.flush();
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
    if (!guild) return;
    const task = guild.scheduledTasks.find((t) => t.id === taskId);
    if (!task) return;
    Object.assign(task, patch);
    guild.updatedAt = new Date().toISOString();
    await this.flush();
  }

  async exportSnapshot(): Promise<DatabaseRoot> {
    return structuredClone(this.state);
  }
}

export function createDatabaseAdapter(
  adapterType: 'local' | 'firestore' | 'supabase',
  localDbPath: string,
  defaultGuildId: string,
): DatabaseAdapter {
  // When user provides external Firebase or Supabase credentials on Lunafy,
  // dedicated drivers plug into this exact DatabaseAdapter interface.
  if (adapterType === 'firestore' || adapterType === 'supabase') {
    console.warn(
      `[Database] Adapter "${adapterType}" selected without active external client provisioning in preview; falling back cleanly to LocalPersistentAdapter.`,
    );
  }
  return new LocalPersistentAdapter(localDbPath, defaultGuildId);
}
