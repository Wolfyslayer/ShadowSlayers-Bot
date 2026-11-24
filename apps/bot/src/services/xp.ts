import crypto from 'crypto';
import type { GuildMemberRecord, ProgressionConfig } from '../../../../packages/shared/src/types.ts';

export function computeLevelFromXp(xp: number, multiplier = 100): number {
  if (xp <= 0) return 1;
  return Math.max(1, Math.floor(Math.sqrt(xp / multiplier)) + 1);
}

export function hashMessageContent(content: string): string {
  return crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export interface XpAwardOutcome {
  awarded: boolean;
  xpAdded: number;
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
  blockedReason: string | null;
}

/**
 * Deterministic XP progression with anti-farming protections:
 * - Enforces per-user cooldown window
 * - Blocks duplicate repeated messages
 * - Ignores short low-effort messages & slash/prefix commands
 */
export function evaluateXpAward(
  member: GuildMemberRecord,
  config: ProgressionConfig,
  messageContent: string,
  nowMs = Date.now(),
): XpAwardOutcome {
  if (!config.enabled || member.isDeparted) {
    return {
      awarded: false,
      xpAdded: 0,
      newXp: member.xp,
      newLevel: member.level,
      leveledUp: false,
      blockedReason: 'progression_disabled_or_departed',
    };
  }

  const trimmed = messageContent.trim();
  if (config.blockBotCommands && (trimmed.startsWith('/') || trimmed.startsWith('!'))) {
    return {
      awarded: false,
      xpAdded: 0,
      newXp: member.xp,
      newLevel: member.level,
      leveledUp: false,
      blockedReason: 'command_message',
    };
  }

  if (trimmed.length < config.minMessageLength) {
    return {
      awarded: false,
      xpAdded: 0,
      newXp: member.xp,
      newLevel: member.level,
      leveledUp: false,
      blockedReason: 'below_min_length',
    };
  }

  if (member.lastXpAt) {
    const elapsedSeconds = (nowMs - new Date(member.lastXpAt).getTime()) / 1000;
    if (elapsedSeconds < config.cooldownSeconds) {
      return {
        awarded: false,
        xpAdded: 0,
        newXp: member.xp,
        newLevel: member.level,
        leveledUp: false,
        blockedReason: 'cooldown_active',
      };
    }
  }

  const msgHash = hashMessageContent(trimmed);
  if (config.blockDuplicateMessages && member.lastMessageHash === msgHash) {
    return {
      awarded: false,
      xpAdded: 0,
      newXp: member.xp,
      newLevel: member.level,
      leveledUp: false,
      blockedReason: 'duplicate_message_suppressed',
    };
  }

  const span = Math.max(0, config.xpPerMessageMax - config.xpPerMessageMin);
  const xpAdded = config.xpPerMessageMin + (span > 0 ? Math.floor((nowMs % (span + 1))) : 0);
  const newXp = member.xp + xpAdded;
  const newLevel = computeLevelFromXp(newXp, config.levelCurveMultiplier);

  return {
    awarded: true,
    xpAdded,
    newXp,
    newLevel,
    leveledUp: newLevel > member.level,
    blockedReason: null,
  };
}
