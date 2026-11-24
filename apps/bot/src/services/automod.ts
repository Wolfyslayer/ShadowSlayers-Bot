import type { AutoModConfig } from '../../../../packages/shared/src/types.ts';

export interface AutoModMessageInput {
  userId: string;
  username: string;
  content: string;
  channelName: string;
  userRoles: string[];
  mentionCount: number;
  nowMs?: number;
}

export interface AutoModEvaluationResult {
  triggered: boolean;
  exempt: boolean;
  ruleHits: string[];
  recommendedActions: AutoModConfig['escalationActions'];
  reason: string | null;
}

interface RecentUserActivity {
  timestamps: number[];
  recentHashes: { hash: string; at: number }[];
}

const DISCORD_INVITE_REGEX = /(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-zA-Z0-9-]+/i;
const URL_REGEX = /https?:\/\/([^\s/$.?#].[^\s]*)/gi;

export class RuleBasedAutoModEngine {
  private readonly userWindows = new Map<string, RecentUserActivity>();
  private recentJoinTimestamps: number[] = [];

  evaluateMessage(config: AutoModConfig, input: AutoModMessageInput): AutoModEvaluationResult {
    if (!config.enabled) {
      return { triggered: false, exempt: false, ruleHits: [], recommendedActions: [], reason: null };
    }

    const isExemptChannel = config.exemptChannelNames.some(
      (c) => c.toLowerCase() === input.channelName.toLowerCase(),
    );
    const isExemptRole = input.userRoles.some((r) =>
      config.exemptRoleNames.some((ex) => ex.toLowerCase() === r.toLowerCase()),
    );

    if (isExemptChannel || isExemptRole) {
      return { triggered: false, exempt: true, ruleHits: [], recommendedActions: [], reason: null };
    }

    const now = input.nowMs ?? Date.now();
    const ruleHits: string[] = [];

    if (config.emergencyLockdown) {
      ruleHits.push('emergency_lockdown');
    }

    // 1. Spam burst check
    const activity = this.userWindows.get(input.userId) ?? { timestamps: [], recentHashes: [] };
    const spamCutoff = now - config.spamWindowSeconds * 1000;
    activity.timestamps = activity.timestamps.filter((t) => t >= spamCutoff);
    activity.timestamps.push(now);
    if (activity.timestamps.length >= config.spamThresholdCount) {
      ruleHits.push('spam_burst');
    }

    // 2. Repeated message check
    const normalized = input.content.trim().toLowerCase();
    const repeatCutoff = now - 60_000;
    activity.recentHashes = activity.recentHashes.filter((h) => h.at >= repeatCutoff);
    activity.recentHashes.push({ hash: normalized, at: now });
    const sameCount = activity.recentHashes.filter((h) => h.hash === normalized && normalized.length > 0).length;
    if (sameCount >= config.repeatedMessageThreshold) {
      ruleHits.push('repeated_message');
    }
    this.userWindows.set(input.userId, activity);

    // 3. Mass mention protection
    if (input.mentionCount > config.maxMentionsPerMessage) {
      ruleHits.push('mass_mentions');
    }

    // 4. Discord invite restriction
    if (config.blockDiscordInvites && DISCORD_INVITE_REGEX.test(input.content)) {
      ruleHits.push('discord_invite');
    }

    // 5. Suspicious / phishing domain filter
    if (config.blockSuspiciousLinks) {
      const matches = input.content.matchAll(URL_REGEX);
      for (const m of matches) {
        const host = m[1].split('/')[0].toLowerCase();
        const isAllowed = config.allowedDomains.some(
          (d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`),
        );
        if (isAllowed) continue;
        const isSuspicious = config.suspiciousDomains.some(
          (d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`),
        );
        if (isSuspicious) {
          ruleHits.push('suspicious_link');
          break;
        }
      }
    }

    // 6. Blocked words filter
    for (const word of config.blockedWords) {
      const clean = word.trim().toLowerCase();
      if (clean.length > 0 && normalized.includes(clean)) {
        ruleHits.push('blocked_word');
        break;
      }
    }

    if (ruleHits.length === 0) {
      return { triggered: false, exempt: false, ruleHits: [], recommendedActions: [], reason: null };
    }

    // Never return permanent ban from automated detection
    const safeActions = config.escalationActions.filter((a) =>
      ['delete', 'warn', 'timeout', 'notify_mods', 'temp_restrict'].includes(a),
    );

    return {
      triggered: true,
      exempt: false,
      ruleHits,
      recommendedActions: safeActions,
      reason: `AutoMod triggered rule(s): ${ruleHits.join(', ')}`,
    };
  }

  evaluateMemberJoin(
    config: AutoModConfig,
    accountCreatedAtMs: number,
    nowMs = Date.now(),
  ): { raidDetected: boolean; accountTooNew: boolean; recommendedActions: string[] } {
    const windowCutoff = nowMs - config.raidWindowSeconds * 1000;
    this.recentJoinTimestamps = this.recentJoinTimestamps.filter((t) => t >= windowCutoff);
    this.recentJoinTimestamps.push(nowMs);

    const raidDetected = this.recentJoinTimestamps.length >= config.raidJoinThreshold;
    const accountAgeHours = (nowMs - accountCreatedAtMs) / 3600_000;
    const accountTooNew = accountAgeHours < config.minAccountAgeHours;

    const recommendedActions: string[] = [];
    if (raidDetected) {
      recommendedActions.push('enable_auto_slowmode', 'notify_mods');
    }
    if (accountTooNew) {
      recommendedActions.push('hold_in_gate_of_shadows', 'notify_mods');
    }
    return { raidDetected, accountTooNew, recommendedActions };
  }
}
