import type {
  ClanRankName,
  ModerationActionType,
  RolePanel,
  ServerDiscoverySnapshot,
} from './types.ts';

export interface BotControlPayloadMap {
  'guild.rescan': { snapshot: ServerDiscoverySnapshot };
  'guild.setup': {
    snapshot: ServerDiscoverySnapshot;
    mode: 'missing_only' | 'full_setup';
    actorUsername: string;
  };
  'language.createChannels': {
    categoryName: string;
    languageRoleName: string;
    channels: Array<{
      key: string;
      name: string;
      type: 'text' | 'voice' | 'announcement';
      readOnly: boolean;
    }>;
    actorUsername: string;
  };
  'member.applyRoleChanges': {
    sourceModule: 'clan' | 'onboarding';
    userId: string;
    changes: Array<{ action: 'grant' | 'remove'; roleName: string; reason: string }>;
  };
  'member.getRoleNames': { userIds: string[] };
  'rolePanel.publish': { panel: RolePanel };
  'rules.publish': {
    channelName: string;
    title: string;
    body: string;
    reactionEmoji: string;
  };
  'moderation.execute': {
    action: ModerationActionType;
    targetUserId: string;
    reason: string;
    durationMinutes: number | null;
    channelName: string;
    deleteMessageSeconds?: number;
  };
  'command.execute': {
    command: string;
    actorUserId: string;
    actorUsername: string;
    actorRank: ClanRankName | null;
    locale: string;
    channelName: string;
    args: Record<string, string | number | boolean>;
  };
}

export interface BotControlResultMap {
  'guild.rescan': ServerDiscoverySnapshot;
  'guild.setup': {
    snapshot: ServerDiscoverySnapshot;
    appliedCount: number;
    failedCount: number;
    skippedConflicts: number;
    skippedManualItems: string[];
    failures: { targetName: string; error: string }[];
  };
  'language.createChannels': {
    ok: boolean;
    categoryId: string | null;
    created: { key: string; name: string; channelId: string | null }[];
    error?: string;
  };
  'member.applyRoleChanges': { ok: boolean; error?: string };
  'member.getRoleNames': Record<string, string[] | null>;
  'rolePanel.publish': { ok: boolean; messageId?: string; error?: string };
  'rules.publish': { ok: boolean; messageId?: string; error?: string };
  'moderation.execute': { ok: boolean; error?: string };
  'command.execute': {
    ok: boolean;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  };
}

export type BotControlOperation = keyof BotControlPayloadMap;

export type BotControlCommand<T extends BotControlOperation = BotControlOperation> =
  T extends BotControlOperation ? {
  id: string;
  guildId: string;
  operation: T;
  payload: BotControlPayloadMap[T];
  actorUserId: string;
  actorUsername: string;
  signature: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  workerId?: string;
  claimedAt?: string;
  completedAt?: string;
  result?: BotControlResultMap[T];
  resultSignature?: string;
  error?: string;
} : never;

export interface BotRuntimeSnapshot {
  connected: boolean;
  mode: 'live_gateway' | 'standby_no_token';
  botTag: string | null;
  guildCount: number;
  guildIds: string[];
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string;
}
