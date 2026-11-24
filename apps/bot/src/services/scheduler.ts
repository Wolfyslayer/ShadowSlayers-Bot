import type { DatabaseAdapter } from '../../../../packages/database/src/adapter.ts';
import type { ScheduledTask } from '../../../../packages/shared/src/types.ts';

/**
 * Crash-safe, idempotent scheduled task runner.
 * Persists task state in DatabaseAdapter and uses an in-flight lock so reconnects or restarts
 * never double-execute tempbans, temporary roles, giveaways, reminders, or announcements.
 */
export class PersistentTaskScheduler {
  private nextLogCleanupAt = 0;
  private readonly inFlight = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private activeTick: Promise<number> | null = null;
  private readonly db: DatabaseAdapter;
  private readonly onDispatch?: (task: ScheduledTask) => Promise<void>;
  private readonly onError: (err: unknown) => void;

  constructor(
    db: DatabaseAdapter,
    onDispatch?: (task: ScheduledTask) => Promise<void>,
    onError: (err: unknown) => void = (err) => console.error('[Scheduler] Tick failed:', err),
  ) {
    this.db = db;
    this.onDispatch = onDispatch;
    this.onError = onError;
  }

  start(intervalMs = 30_000): void {
    if (this.timer) return;
    // Recover overdue tasks immediately on boot
    this.scheduleTick();
    this.timer = setInterval(() => {
      this.scheduleTick();
    }, intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.activeTick) await this.activeTick.catch(this.onError);
  }

  private scheduleTick(): void {
    if (this.activeTick) return;
    const activeTick = this.tick();
    this.activeTick = activeTick;
    void activeTick
      .catch(this.onError)
      .finally(() => {
        if (this.activeTick === activeTick) this.activeTick = null;
      });
  }

  async tick(nowIso = new Date().toISOString()): Promise<number> {
    const dueTasks = await this.db.getPendingTasks(nowIso);
    let executed = 0;

    for (const task of dueTasks) {
      if (this.inFlight.has(task.id)) continue;
      this.inFlight.add(task.id);

      try {
        await this.db.updateTaskStatus(task.guildId, task.id, {
          status: 'running',
          attempts: task.attempts + 1,
        });

        await this.executeTask(task);

        await this.db.updateTaskStatus(task.guildId, task.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          lastError: null,
        });
        executed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.db.updateTaskStatus(task.guildId, task.id, {
          status: 'failed',
          lastError: message,
        });
      } finally {
        this.inFlight.delete(task.id);
      }
    }

    try {
      await this.pruneExpiredAuditLogs(nowIso);
    } catch (err) {
      this.onError(err);
    }

    return executed;
  }

  private async pruneExpiredAuditLogs(nowIso: string, force = false): Promise<void> {
    const nowMs = Date.parse(nowIso);
    if (!Number.isFinite(nowMs)) {
      throw new Error(`[Scheduler] Cannot prune audit logs: invalid reference time "${nowIso}".`);
    }
    if (!force && nowMs < this.nextLogCleanupAt) return;

    this.nextLogCleanupAt = nowMs + 60_000;
    await this.db.pruneExpiredAuditLogs(new Date(nowMs).toISOString());
    this.nextLogCleanupAt = nowMs + 86400_000;
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    const guild = await this.db.getGuild(task.guildId);
    if (!guild) return;

    const now = new Date().toISOString();

    if (task.type === 'tempban_expiry') {
      const modCase = guild.moderationCases.find((c) => c.caseId === task.targetId);
      if (modCase && modCase.active) {
        modCase.active = false;
      }
    } else if (task.type === 'temprole_expiry') {
      const grant = guild.temporaryRoles.find((r) => r.id === task.targetId);
      if (grant && grant.active) {
        grant.active = false;
      }
    } else if (task.type === 'reminder') {
      const rem = guild.reminders.find((r) => r.id === task.targetId);
      if (rem) rem.completed = true;
    } else if (task.type === 'giveaway_draw') {
      const gw = guild.giveaways.find((g) => g.id === task.targetId);
      if (gw && gw.status === 'active') {
        gw.status = 'ended';
        if (gw.entrants.length > 0 && gw.winnerIds.length === 0) {
          const pool = [...gw.entrants];
          const winners: string[] = [];
          while (winners.length < gw.winnerCount && pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length);
            winners.push(pool.splice(idx, 1)[0]);
          }
          gw.winnerIds = winners;
        }
      }
    } else if (task.type === 'scheduled_announcement') {
      const ann = guild.scheduledAnnouncements.find((a) => a.id === task.targetId);
      if (ann) ann.sent = true;
    } else if (task.type === 'log_cleanup') {
      const cutoff = Date.now() - guild.logging.retentionDays * 86400_000;
      guild.logs = guild.logs.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
      await this.pruneExpiredAuditLogs(now, true);
    }

    if (this.onDispatch) {
      await this.onDispatch(task);
    }

    await this.db.saveGuild(guild);
    await this.db.appendAuditLog(guild.guildId, {
      id: `log-task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      guildId: guild.guildId,
      category: 'config_change',
      actorId: 'scheduler',
      actorName: 'ShadowSlayers Scheduler',
      targetId: task.targetId,
      targetName: task.type,
      summary: `Executed scheduled task (${task.type}): ${task.description}`,
      details: { taskId: task.id },
      createdAt: now,
    });
  }
}
