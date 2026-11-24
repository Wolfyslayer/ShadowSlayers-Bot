import crypto from 'crypto';
import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  DiscordAPIError,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  type CommandInteractionOption,
  type Guild,
  type GuildMember,
} from 'discord.js';
import type { DiscordCommandScope } from '../../../packages/config/src/env.ts';
import type { DatabaseAdapter } from '../../../packages/database/src/adapter.ts';
import { createInitialGuildSeed } from '../../../packages/database/src/seed.ts';
import type { BotControlCommand, BotRuntimeSnapshot } from '../../../packages/shared/src/bot-control.ts';
import {
  signBotControlResult,
  verifyBotControlCommand,
} from '../../../packages/shared/src/bot-control-signature.ts';
import {
  applySelfRoleSelection,
  canBotManageRolePosition,
  canBotModerateMemberPosition,
  resolveClanRankFromRoleNames,
} from '../../../packages/permissions/src/hierarchy.ts';
import {
  CLAN_RANK_ORDER,
  type ClanRankName,
  type ModerationActionType,
  type RolePanel,
  type ServerDiscoverySnapshot,
} from '../../../packages/shared/src/types.ts';
import { LEGACY_ROLE_SPECS } from '../../../packages/shared/src/legacy-template.ts';
import { buildDiscordSlashCommandsJson, executeSlashCommand, type DiscordCommandExecutor } from './commands/registry.ts';
import { dispatchLiveSetupButton, handleLiveSlashSetup } from './commands/setup.ts';
import { RuleBasedAutoModEngine } from './services/automod.ts';
import {
  discoverLiveDiscordGuild,
  executeAdditiveSetupOnDiscordGuild,
  resolveRoleMatch,
  type GuildLike,
  type SetupExecutionReport,
} from './services/discovery.ts';
import { applyRulesVerificationReaction, grantActivePlayerRecruit } from './services/onboarding.ts';
import { evaluateXpAward, hashMessageContent } from './services/xp.ts';

export interface BotRuntimeStatus {
  connected: boolean;
  mode: 'live_gateway' | 'standby_no_token';
  botTag: string | null;
  guildCount: number;
  lastError: string | null;
  startedAt: string | null;
  commandsScope?: 'guild' | 'global' | null;
  commandsRegisteredCount?: number;
}

export function extractDiscordInteractionArgs(
  options: readonly CommandInteractionOption[],
): Record<string, string | number | boolean> {
  const args: Record<string, string | number | boolean> = {};

  const walk = (list: readonly CommandInteractionOption[]) => {
    for (const opt of list) {
      if (
        opt.type === ApplicationCommandOptionType.Subcommand ||
        opt.type === ApplicationCommandOptionType.SubcommandGroup
      ) {
        if (opt.options && opt.options.length > 0) {
          walk(opt.options);
        }
        continue;
      }

      if (opt.type === ApplicationCommandOptionType.Channel) {
        const chName = opt.channel && 'name' in opt.channel && opt.channel.name ? opt.channel.name : null;
        args[opt.name] = chName ?? (opt.value !== undefined ? String(opt.value) : '');
        continue;
      }

      if (opt.type === ApplicationCommandOptionType.User) {
        args[opt.name] = opt.value !== undefined ? String(opt.value) : '';
        if (opt.user?.username) {
          args[`${opt.name}_username`] = opt.user.username;
        }
        continue;
      }

      if (opt.value !== undefined) {
        args[opt.name] = opt.value;
      }
    }
  };

  walk(options);
  return args;
}

export class ShadowSlayersBotClient {
  private client: Client | null = null;
  private readonly automod = new RuleBasedAutoModEngine();
  private readonly db: DatabaseAdapter;
  private lastRegisteredCommandHash: string | null = null;
  private readonly guildCommandRegistrationInFlight = new Map<string, Promise<void>>();
  private controlPollTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private controlPoll: Promise<void> | null = null;
  private readonly controlWorkerId = `${process.pid}-${crypto.randomUUID()}`;
  private status: BotRuntimeStatus = {
    connected: false,
    mode: 'standby_no_token',
    botTag: null,
    guildCount: 0,
    lastError: null,
    startedAt: null,
    commandsScope: null,
    commandsRegisteredCount: 0,
  };

  constructor(db: DatabaseAdapter, private readonly botControlSecret = '') {
    this.db = db;
  }

  getStatus(): BotRuntimeStatus {
    return { ...this.status };
  }

  getLiveDiscordGuild(guildId?: string): Guild | null {
    if (!guildId) return null;
    if (!this.client || !this.status.connected) return null;
    return this.client.guilds.cache.get(guildId) ?? null;
  }

  private async persistRuntimeStatus(guildIdsOverride?: string[]): Promise<void> {
    if (this.db.driverName !== 'firestore') return;
    const snapshot: BotRuntimeSnapshot = {
      ...this.status,
      guildIds: guildIdsOverride ?? (this.client ? [...this.client.guilds.cache.keys()].sort() : []),
      updatedAt: new Date().toISOString(),
    };
    await this.db.setBotRuntimeStatus(snapshot);
  }

  private async executeControlCommand(command: BotControlCommand): Promise<unknown> {
    if (!verifyBotControlCommand(command, this.botControlSecret)) {
      throw new Error('Rejected bot command with an invalid API signature.');
    }
    const liveGuild = this.getLiveDiscordGuild(command.guildId);
    if (!liveGuild) {
      throw new Error(`Discord Gateway is not connected to guild ${command.guildId}.`);
    }

    switch (command.operation) {
      case 'guild.rescan': {
        const snapshot = await this.rescanLiveGuild(command.payload.snapshot, command.guildId);
        if (!snapshot) throw new Error(`Could not rescan guild ${command.guildId}: Discord Gateway unavailable.`);
        return snapshot;
      }
      case 'guild.setup': {
        const report = await this.applySetupOnLiveGuild(command.payload.snapshot, {
          mode: command.payload.mode,
          actorUsername: command.payload.actorUsername,
        }, command.guildId);
        if (!report) throw new Error(`Could not apply setup to guild ${command.guildId}: Discord Gateway unavailable.`);
        return report;
      }
      case 'language.createChannels':
        return this.createLanguageChannelsOnDiscord(liveGuild, command.payload);
      case 'member.applyRoleChanges': {
        for (const change of command.payload.changes) {
          const result = change.action === 'grant'
            ? await this.grantRoleOnDiscord(liveGuild, command.payload.userId, change.roleName, change.reason)
            : await this.removeRoleOnDiscord(liveGuild, command.payload.userId, change.roleName, change.reason);
          if (!result.ok) return result;
        }
        return { ok: true };
      }
      case 'member.getRoleNames': {
        const result: Record<string, string[] | null> = {};
        for (let index = 0; index < command.payload.userIds.length; index += 5) {
          const batch = command.payload.userIds.slice(index, index + 5);
          await Promise.all(batch.map(async (userId) => {
            let member: GuildMember;
            try {
              member = await liveGuild.members.fetch(userId);
            } catch (err) {
              if (err instanceof DiscordAPIError && err.code === 10007) {
                result[userId] = null;
                return;
              }
              throw err;
            }
            result[userId] = member ? [...member.roles.cache.values()].map((role) => role.name) : null;
          }));
        }
        return result;
      }
      case 'rolePanel.publish':
        return this.publishRolePanelToDiscord(liveGuild, command.payload.panel);
      case 'rules.publish':
        return this.publishRulesToDiscord(liveGuild, command.payload);
      case 'moderation.execute':
        return this.executeLiveModeration(liveGuild, command.payload);
      case 'command.execute':
        return executeSlashCommand(command.payload.command, {
          guildId: command.guildId,
          actorUserId: command.payload.actorUserId,
          actorUsername: command.payload.actorUsername,
          actorRank: command.payload.actorRank,
          locale: command.payload.locale,
          channelName: command.payload.channelName,
          args: command.payload.args,
          db: this.db,
          discordExecutor: this.buildDiscordExecutor(liveGuild),
        });
      default: {
        const exhaustive: never = command;
        throw new Error(`Unsupported bot command: ${String(exhaustive)}`);
      }
    }
  }

  private async pollBotControlCommands(): Promise<void> {
    if (
      this.db.driverName !== 'firestore' ||
      !this.client ||
      !this.status.connected ||
      this.controlPoll
    ) return;

    this.controlPoll = (async () => {
      const guildIds = [...this.client!.guilds.cache.keys()];
      const command = await this.db.claimNextBotCommand(
        guildIds,
        this.controlWorkerId,
        new Date().toISOString(),
      );
      if (!command) return;

      try {
        const result = await this.executeControlCommand(command);
        const resultSignature = signBotControlResult(command, result, this.botControlSecret);
        const completed = await this.db.completeBotCommand(
          command.guildId,
          command.id,
          this.controlWorkerId,
          result,
          resultSignature,
          new Date().toISOString(),
        );
        if (!completed) {
          console.error(`[ShadowSlayers] Lost claim while completing bot command ${command.id}.`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.db.failBotCommand(
          command.guildId,
          command.id,
          this.controlWorkerId,
          message,
          new Date().toISOString(),
        );
        console.error(`[ShadowSlayers] Bot command ${command.id} failed:`, message);
      }
    })()
      .catch((err) => {
        console.error('[ShadowSlayers] Bot control queue polling failed:', err);
      })
      .finally(() => {
        this.controlPoll = null;
      });

    await this.controlPoll;
  }

  private startBotControlPolling(): void {
    if (this.db.driverName !== 'firestore' || this.controlPollTimer) return;
    this.controlPollTimer = setInterval(() => {
      void this.pollBotControlCommands();
    }, 5_000);
    this.controlPollTimer.unref();
    this.statusTimer = setInterval(() => {
      void this.persistRuntimeStatus().catch((err) => {
        console.error('[ShadowSlayers] Could not publish bot runtime status:', err);
      });
    }, 15_000);
    this.statusTimer.unref();
    void this.pollBotControlCommands();
  }

  private async auditRuntimeError(summary: string): Promise<void> {
    const guildIds = new Set(this.client ? [...this.client.guilds.cache.keys()] : []);
    await Promise.all([...guildIds].map(async (guildId) => {
      try {
        await this.db.appendAuditLog(guildId, {
          id: `log-boterr-${crypto.randomUUID()}`,
          guildId,
          category: 'bot_error',
          actorId: 'bot',
          actorName: 'Discord Gateway',
          targetId: null,
          targetName: null,
          summary,
          details: {},
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`[ShadowSlayers] Could not audit bot error for guild ${guildId}:`, err);
      }
    }));
  }

  private async synchronizeGuildState(discordGuild: Guild): Promise<void> {
    const guild = (await this.db.getGuild(discordGuild.id)) ??
      createInitialGuildSeed(discordGuild.id, discordGuild.name);
    guild.guildName = discordGuild.name;
    guild.discovery = discoverLiveDiscordGuild(discordGuild as unknown as GuildLike, guild.discovery);
    await this.db.saveGuild(guild);
  }

  async rescanLiveGuild(
    existing: ServerDiscoverySnapshot,
    guildId = existing.guildId,
  ): Promise<ServerDiscoverySnapshot | null> {
    const liveGuild = this.getLiveDiscordGuild(guildId);
    if (!liveGuild) return null;
    await liveGuild.roles.fetch();
    await liveGuild.channels.fetch();
    return discoverLiveDiscordGuild(liveGuild as unknown as GuildLike, existing);
  }

  async applySetupOnLiveGuild(
    existing: ServerDiscoverySnapshot,
    options: { mode: 'missing_only' | 'full_setup'; actorUsername: string },
    guildId = existing.guildId,
  ): Promise<SetupExecutionReport | null> {
    const liveGuild = this.getLiveDiscordGuild(guildId);
    if (!liveGuild) return null;
    return executeAdditiveSetupOnDiscordGuild(liveGuild as unknown as GuildLike, existing, options);
  }

  buildDiscordExecutor(liveGuild: Guild): DiscordCommandExecutor {
    return {
      executeModeration: async ({ action, targetUserId, reason, durationMinutes, channelName, deleteMessageSeconds }) => {
        return this.executeLiveModeration(liveGuild, {
          action,
          targetUserId,
          reason,
          durationMinutes,
          channelName,
          deleteMessageSeconds,
        });
      },
      publishRolePanel: async (panel) => {
        return this.publishRolePanelToDiscord(liveGuild, panel);
      },
      publishRulesMessage: async (params) => {
        return this.publishRulesToDiscord(liveGuild, params);
      },
      grantDiscordRole: async ({ userId, roleName, reason }) => {
        return this.grantRoleOnDiscord(liveGuild, userId, roleName, reason);
      },
      removeDiscordRole: async ({ userId, roleName, reason }) => {
        return this.removeRoleOnDiscord(liveGuild, userId, roleName, reason);
      },
      getLiveMemberRoleNames: async (userId) => {
        const m = await liveGuild.members.fetch(userId).catch(() => null);
        if (!m) return null;
        return [...m.roles.cache.values()].map((r) => r.name);
      },
      getBotRuntimeSummary: () => ({
        connected: this.status.connected,
        mode: this.status.mode,
        botTag: this.status.botTag,
        guildCount: this.status.guildCount,
      }),
    };
  }

  async grantRoleOnDiscord(
    liveGuild: Guild,
    userId: string,
    roleName: string,
    reason: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const member = await liveGuild.members.fetch(userId).catch(() => null);
      if (!member) return { ok: false, error: 'Target member not found in Discord guild.' };
      const allRoles = [...liveGuild.roles.cache.values()];
      const spec = LEGACY_ROLE_SPECS.find((s) => s.name === roleName);
      const resolved = resolveRoleMatch({ name: roleName, aliases: spec?.aliases ?? [] }, allRoles);
      if (resolved.status === 'conflicting') {
        return { ok: false, error: `Ambiguous role candidates for "${roleName}".` };
      }
      if (!resolved.matched) {
        return { ok: false, error: `Role "${roleName}" does not exist on Discord.` };
      }
      const botHighest = liveGuild.members.me?.roles.highest.position ?? 0;
      if (!canBotManageRolePosition(botHighest, resolved.matched.position)) {
        return { ok: false, error: `Bot role hierarchy is too low to assign "${resolved.matched.name}".` };
      }
      if (!member.roles.cache.has(resolved.matched.id)) {
        await member.roles.add(resolved.matched.id, reason);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async removeRoleOnDiscord(
    liveGuild: Guild,
    userId: string,
    roleName: string,
    reason: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const member = await liveGuild.members.fetch(userId).catch(() => null);
      if (!member) return { ok: false, error: 'Target member not found in Discord guild.' };
      const allRoles = [...liveGuild.roles.cache.values()];
      const spec = LEGACY_ROLE_SPECS.find((s) => s.name === roleName);
      const resolved = resolveRoleMatch({ name: roleName, aliases: spec?.aliases ?? [] }, allRoles);
      if (resolved.status === 'conflicting') {
        return { ok: false, error: `Ambiguous role candidates for "${roleName}".` };
      }
      if (!resolved.matched) {
        return { ok: false, error: `Role "${roleName}" does not exist on Discord.` };
      }
      const botHighest = liveGuild.members.me?.roles.highest.position ?? 0;
      if (!canBotManageRolePosition(botHighest, resolved.matched.position)) {
        return { ok: false, error: `Bot role hierarchy is too low to remove "${resolved.matched.name}".` };
      }
      if (member.roles.cache.has(resolved.matched.id)) {
        await member.roles.remove(resolved.matched.id, reason);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async createLanguageChannelsOnDiscord(
    liveGuild: Guild,
    input: {
      categoryName: string;
      languageRoleName: string;
      channels: Array<{ key: string; name: string; type: 'text' | 'voice' | 'announcement'; readOnly: boolean }>;
      actorUsername: string;
    },
  ): Promise<{
    ok: boolean;
    categoryId: string | null;
    created: { key: string; name: string; channelId: string | null }[];
    error?: string;
  }> {
    try {
      await liveGuild.roles.fetch();
      await liveGuild.channels.fetch();

      const allRoles = [...liveGuild.roles.cache.values()];
      const langRoleResolved = resolveRoleMatch({ name: input.languageRoleName, aliases: [] }, allRoles);
      let langRole = langRoleResolved.matched;
      if (langRoleResolved.status === 'conflicting') {
        return {
          ok: false,
          categoryId: null,
          created: [],
          error: `Ambiguous existing roles matching "${input.languageRoleName}". Resolve conflict manually first.`,
        };
      }
      if (!langRole) {
        const createdRole = await liveGuild.roles.create({
          name: input.languageRoleName,
          mentionable: false,
          reason: `Language realm setup by ${input.actorUsername}`,
        });
        langRole = createdRole;
      }

      let category = liveGuild.channels.cache.find(
        (c) =>
          c.guildId === liveGuild.id &&
          c.type === ChannelType.GuildCategory &&
          c.name.toLowerCase() === input.categoryName.toLowerCase(),
      );

      if (!category) {
        category = await liveGuild.channels.create({
          name: input.categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: liveGuild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: langRole.id, allow: [PermissionFlagsBits.ViewChannel] },
          ],
          reason: `Language category created by ${input.actorUsername}`,
        });
      }

      const created: { key: string; name: string; channelId: string | null }[] = [];
      for (const spec of input.channels) {
        const existingCh = liveGuild.channels.cache.find(
          (c) => c.guildId === liveGuild.id && c.name === spec.name,
        );
        if (existingCh) {
          created.push({ key: spec.key, name: existingCh.name, channelId: existingCh.id });
          continue;
        }
        const chType =
          spec.type === 'voice'
            ? ChannelType.GuildVoice
            : spec.type === 'announcement'
              ? ChannelType.GuildAnnouncement
              : ChannelType.GuildText;

        const overwrites = [
          {
            id: liveGuild.id,
            deny: spec.readOnly
              ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
              : [PermissionFlagsBits.ViewChannel],
          },
          { id: langRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        ];

        const ch = await liveGuild.channels.create({
          name: spec.name,
          type: chType,
          parent: category.id,
          permissionOverwrites: overwrites,
          reason: `Approved language channel setup by ${input.actorUsername}`,
        });
        created.push({ key: spec.key, name: ch.name, channelId: ch.id });
      }

      return { ok: true, categoryId: category.id, created };
    } catch (err) {
      return {
        ok: false,
        categoryId: null,
        created: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async publishRulesToDiscord(
    liveGuild: Guild,
    params: { channelName: string; title: string; body: string; reactionEmoji: string },
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    try {
      const targetChannel = liveGuild.channels.cache.find(
        (c) =>
          c.guildId === liveGuild.id &&
          (c.name === params.channelName || c.id === params.channelName || c.name === '📜・rules' || c.name === 'rules') &&
          (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement),
      );
      if (!targetChannel || !targetChannel.isTextBased() || !('send' in targetChannel)) {
        return { ok: false, error: `Target rules channel #${params.channelName} was not found on Discord.` };
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('onboarding:active_player')
          .setLabel('Join Clan as 🌱 Recruit (After Language & Class)')
          .setStyle(ButtonStyle.Success),
      );

      const sent = await targetChannel.send({
        content: `**${params.title}**\n\n${params.body}\n\n_React with ${params.reactionEmoji} below to receive **✅ Verified**, then choose your Language and Class in **🎭・choose-your-role** / **🎭・выбор-ролей**._`,
        components: [row],
      });
      await sent.react(params.reactionEmoji).catch(() => undefined);
      return { ok: true, messageId: sent.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async executeLiveModeration(
    liveGuild: Guild,
    params: {
      action: ModerationActionType;
      targetUserId: string;
      reason: string;
      durationMinutes: number | null;
      channelName: string;
      deleteMessageSeconds?: number;
    },
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const botMember = liveGuild.members.me ?? (await liveGuild.members.fetchMe());
      const botHighest = botMember.roles.highest.position;

      if (params.action === 'unban') {
        await liveGuild.members.unban(params.targetUserId, params.reason);
        return { ok: true };
      }

      if (params.action === 'slowmode' || params.action === 'lock' || params.action === 'unlock' || params.action === 'purge') {
        const ch = liveGuild.channels.cache.find(
          (c) =>
            c.guildId === liveGuild.id &&
            (c.name === params.channelName || c.id === params.channelName) &&
            c.isTextBased(),
        );
        if (!ch || !('permissionOverwrites' in ch)) {
          return { ok: false, error: `Text channel #${params.channelName} not found on Discord guild.` };
        }
        if (params.action === 'lock') {
          await ch.permissionOverwrites.edit(liveGuild.id, { SendMessages: false }, { reason: params.reason });
        } else if (params.action === 'unlock') {
          await ch.permissionOverwrites.edit(liveGuild.id, { SendMessages: null }, { reason: params.reason });
        } else if (params.action === 'slowmode' && 'setRateLimitPerUser' in ch) {
          await ch.setRateLimitPerUser(Math.max(0, Math.min(21600, params.durationMinutes ?? 10)), params.reason);
        } else if (params.action === 'purge' && 'bulkDelete' in ch) {
          await ch.bulkDelete(Math.min(100, Math.max(1, params.durationMinutes ?? 10)), true);
        }
        return { ok: true };
      }

      const targetMember = await liveGuild.members.fetch(params.targetUserId).catch(() => null);
      if (targetMember && !canBotModerateMemberPosition(botHighest, targetMember.roles.highest.position)) {
        return {
          ok: false,
          error: `Bot role position (${botHighest}) is not above target member's highest role (${targetMember.roles.highest.position}).`,
        };
      }

      if (params.action === 'warn') {
        if (!targetMember) return { ok: false, error: 'Target member is not currently in the Discord guild.' };
        return { ok: true };
      }
      if (params.action === 'timeout') {
        if (!targetMember) return { ok: false, error: 'Target member is not currently in the guild.' };
        const ms = Math.min(28 * 86400_000, Math.max(60_000, (params.durationMinutes ?? 60) * 60_000));
        await targetMember.timeout(ms, params.reason);
        return { ok: true };
      }
      if (params.action === 'untimeout') {
        if (!targetMember) return { ok: false, error: 'Target member is not currently in the guild.' };
        await targetMember.timeout(null, params.reason);
        return { ok: true };
      }
      if (params.action === 'kick') {
        if (!targetMember) return { ok: false, error: 'Target member is not currently in the guild.' };
        await targetMember.kick(params.reason);
        return { ok: true };
      }
      if (params.action === 'ban' || params.action === 'tempban') {
        await liveGuild.members.ban(params.targetUserId, {
          reason: params.reason,
          ...(typeof params.deleteMessageSeconds === 'number'
            ? { deleteMessageSeconds: Math.min(604800, Math.max(0, params.deleteMessageSeconds)) }
            : {}),
        });
        return { ok: true };
      }
      return { ok: false, error: `Unsupported live moderation action: ${params.action}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async publishRolePanelToDiscord(
    liveGuild: Guild,
    panel: RolePanel,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    try {
      const targetChannel = liveGuild.channels.cache.find(
        (c) =>
          c.guildId === liveGuild.id &&
          (c.name === panel.channelName || c.id === panel.channelName) &&
          (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement),
      );
      if (!targetChannel || !targetChannel.isTextBased() || !('send' in targetChannel)) {
        return { ok: false, error: `Target channel #${panel.channelName} was not found on Discord.` };
      }

      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const item of panel.items.slice(0, 5)) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`rolepanel:${panel.id}:${item.roleId}`)
            .setLabel(item.label)
            .setStyle(panel.groupType === 'exclusive' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        );
      }

      const sent = await targetChannel.send({
        content: `**${panel.title}**\n${panel.description}\n_Mode: ${panel.groupType === 'exclusive' ? 'Exclusive (one active role)' : 'Multiple selections allowed'}_`,
        components: row.components.length > 0 ? [row] : [],
      });
      return { ok: true, messageId: sent.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async handleRolePanelButton(
    customId: string,
    member: GuildMember,
    liveGuild: Guild,
  ): Promise<{ ok: boolean; message: string }> {
    const [, panelId, itemRoleKey] = customId.split(':');
    const guildState = await this.db.getGuild(liveGuild.id);
    if (!guildState) return { ok: false, message: 'Guild configuration missing.' };

    const panel = guildState.rolePanels.find((p) => p.id === panelId);
    if (!panel) return { ok: false, message: 'Role panel not found.' };

    const item = panel.items.find((i) => i.roleId === itemRoleKey);
    if (!item) return { ok: false, message: 'Role option not found on panel.' };

    if (panel.category === 'clan_rank' || panel.category === 'verified' || panel.category === 'system') {
      return {
        ok: false,
        message: 'Clan hierarchy ranks, Bots, and ✅ Verified cannot be self-assigned through public role panels.',
      };
    }

    const botHighest = liveGuild.members.me?.roles.highest.position ?? 0;
    const allRoles = [...liveGuild.roles.cache.values()];
    const roleSpec = LEGACY_ROLE_SPECS.find((s) => s.key === item.roleId || s.name === item.label);
    const resolved = resolveRoleMatch(
      { name: item.label, aliases: roleSpec?.aliases ?? [] },
      allRoles,
    );

    if (resolved.status === 'conflicting') {
      return {
        ok: false,
        message: `Ambiguous role candidates found for "${item.label}". Administrator conflict resolution required.`,
      };
    }
    if (!resolved.matched) {
      return { ok: false, message: `Discord role "${item.label}" does not exist yet on this server.` };
    }
    if (!canBotManageRolePosition(botHighest, resolved.matched.position)) {
      return {
        ok: false,
        message: `Bot role hierarchy is too low to manage "${resolved.matched.name}".`,
      };
    }

    const currentRoleNames = [...member.roles.cache.values()].map((r) => r.name);
    const resolvedClanRank = resolveClanRankFromRoleNames(currentRoleNames);

    let memberRec = guildState.members.find((m) => m.userId === member.id);
    if (!memberRec) {
      memberRec = {
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        avatarUrl: member.displayAvatarURL(),
        clanRank: resolvedClanRank,
        hasClanRank: resolvedClanRank !== null,
        languageCodes: [],
        gamingClasses: [],
        notificationRoles: [],
        verified: member.roles.cache.some((r) => r.name === '✅ Verified'),
        xp: 0,
        level: 1,
        messagesCount: 0,
        voiceMinutes: 0,
        achievements: [],
        customBio: '',
        lastXpAt: null,
        lastMessageHash: null,
        joinedAt: member.joinedAt?.toISOString() ?? new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        isDeparted: false,
        deletedAt: null,
      };
      guildState.members.push(memberRec);
    }

    const groupKind =
      panel.category === 'language' ? 'language' : panel.category === 'class' ? 'class' : 'notification';
    const valueForDb =
      groupKind === 'language'
        ? item.roleId.replace(/^lang_/, '')
        : item.label;

    const sel = applySelfRoleSelection(memberRec, groupKind, valueForDb);
    if (!sel.allowed) {
      return { ok: false, message: sel.reason || 'Role selection denied.' };
    }

    if (panel.groupType === 'exclusive') {
      for (const sibling of panel.items) {
        if (sibling.roleId === item.roleId) continue;
        const sibSpec = LEGACY_ROLE_SPECS.find((s) => s.key === sibling.roleId || s.name === sibling.label);
        const sibResolved = resolveRoleMatch({ name: sibling.label, aliases: sibSpec?.aliases ?? [] }, allRoles);
        if (sibResolved.matched && member.roles.cache.has(sibResolved.matched.id)) {
          await member.roles.remove(sibResolved.matched.id, `Exclusive role switch in ${panel.title}`);
        }
      }
      if (!member.roles.cache.has(resolved.matched.id)) {
        await member.roles.add(resolved.matched.id, `Selected in ${panel.title}`);
      }
    } else {
      if (member.roles.cache.has(resolved.matched.id)) {
        await member.roles.remove(resolved.matched.id, `Toggled off in ${panel.title}`);
      } else {
        await member.roles.add(resolved.matched.id, `Toggled on in ${panel.title}`);
      }
    }

    memberRec.languageCodes = sel.languageCodes;
    memberRec.gamingClasses = sel.gamingClasses;
    memberRec.notificationRoles = sel.notificationRoles;
    await this.db.saveGuild(guildState);
    await this.db.appendAuditLog(liveGuild.id, {
      id: `log-selfrole-${Date.now()}`,
      guildId: liveGuild.id,
      category: 'role_change',
      actorId: member.id,
      actorName: member.user.username,
      targetId: resolved.matched.id,
      targetName: resolved.matched.name,
      summary: `${member.user.username} updated ${panel.category} role (${resolved.matched.name}) via ${panel.title}; clan rank unchanged.`,
      details: { panelId: panel.id, groupType: panel.groupType },
      createdAt: new Date().toISOString(),
    });

    return { ok: true, message: `Updated **${resolved.matched.name}** cleanly.` };
  }

  private async handleRulesReactionChange(
    messageId: string,
    channelName: string,
    emojiName: string | null,
    userId: string,
    username: string,
    added: boolean,
    liveGuild: Guild,
  ): Promise<void> {
    const guildId = liveGuild.id;
    const guildState = await this.db.getGuild(guildId);
    if (!guildState || !guildState.onboarding.enabled) return;

    const isRulesChannel =
      channelName === guildState.onboarding.rulesChannelName || channelName === '📜・rules' || channelName === 'rules';
    const isRulesMessage = guildState.onboarding.rulesMessageId
      ? guildState.onboarding.rulesMessageId === messageId
      : isRulesChannel;
    const expectedEmoji = guildState.onboarding.rulesReactionEmoji || '✅';
    if (!isRulesMessage || emojiName !== expectedEmoji) return;

    const member = await liveGuild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const verifiedSpec = LEGACY_ROLE_SPECS.find((r) => r.key === 'sys_verified');
    const resolvedVerified = resolveRoleMatch(
      { name: '✅ Verified', aliases: verifiedSpec?.aliases ?? [] },
      [...liveGuild.roles.cache.values()],
    );
    const botHighest = liveGuild.members.me?.roles.highest.position ?? 0;

    if (!resolvedVerified.matched || !canBotManageRolePosition(botHighest, resolvedVerified.matched.position)) {
      await this.db.appendAuditLog(guildId, {
        id: `log-rulesverify-err-${Date.now()}`,
        guildId,
        category: 'bot_error',
        actorId: userId,
        actorName: username,
        targetId: null,
        targetName: '✅ Verified',
        summary: `Could not update ✅ Verified on Discord for ${username}: role missing or bot position insufficient.`,
        details: { added, channelName },
        createdAt: new Date().toISOString(),
      });
      return;
    }

    try {
      if (added && !member.roles.cache.has(resolvedVerified.matched.id)) {
        await member.roles.add(resolvedVerified.matched.id, '📜・rules ✅ reaction verification');
      } else if (!added && member.roles.cache.has(resolvedVerified.matched.id)) {
        await member.roles.remove(resolvedVerified.matched.id, 'Removed ✅ rules verification reaction (unrelated roles preserved)');
      }
    } catch (err) {
      await this.db.appendAuditLog(guildId, {
        id: `log-rulesverify-fail-${Date.now()}`,
        guildId,
        category: 'bot_error',
        actorId: userId,
        actorName: username,
        targetId: resolvedVerified.matched.id,
        targetName: '✅ Verified',
        summary: `Discord API rejected ✅ Verified update for ${username}: ${err instanceof Error ? err.message : String(err)}`,
        details: { added, channelName },
        createdAt: new Date().toISOString(),
      });
      return;
    }

    applyRulesVerificationReaction(guildState, { userId, username, added });
    await this.db.saveGuild(guildState);
    await this.db.appendAuditLog(guildId, {
      id: `log-rulesverify-${Date.now()}`,
      guildId,
      category: 'role_change',
      actorId: userId,
      actorName: username,
      targetId: resolvedVerified.matched.id,
      targetName: '✅ Verified',
      summary: added
        ? `${username} accepted 📜・rules (${expectedEmoji}) and received ✅ Verified.`
        : `${username} removed ${expectedEmoji} in 📜・rules; ✅ Verified removed while preserving all unrelated roles.`,
      details: { added, channelName },
      createdAt: new Date().toISOString(),
    });
  }

  private async syncLiveMemberRolesToDb(member: GuildMember, departed = false): Promise<void> {
    const guildId = member.guild.id;
    const guildState = await this.db.getGuild(guildId);
    if (!guildState) return;
    const rec = guildState.members.find((m) => m.userId === member.id);
    if (!rec) return;

    if (departed) {
      rec.isDeparted = true;
      rec.clanRank = null;
      rec.hasClanRank = false;
      rec.verified = false;
    } else {
      const roleNames = [...member.roles.cache.values()].map((r) => r.name);
      const nextRank = resolveClanRankFromRoleNames(roleNames);
      rec.clanRank = nextRank;
      rec.hasClanRank = nextRank !== null;
      rec.verified = roleNames.includes('✅ Verified');
      rec.isDeparted = false;
    }
    await this.db.saveGuild(guildState);
  }

  private async registerSlashCommandsForGuild(
    botToken: string,
    clientId: string,
    guildId: string,
  ): Promise<void> {
    const pending = this.guildCommandRegistrationInFlight.get(guildId);
    if (pending) {
      await pending;
      return;
    }

    const registration = (async () => {
      const rest = new REST().setToken(botToken);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: buildDiscordSlashCommandsJson(),
      });
      this.status.commandsScope = 'guild';
      this.status.commandsRegisteredCount = buildDiscordSlashCommandsJson().length;
      console.log(`[ShadowSlayers] Registered slash commands for newly joined guild ${guildId}.`);
    })();

    this.guildCommandRegistrationInFlight.set(guildId, registration);
    try {
      await registration;
    } finally {
      if (this.guildCommandRegistrationInFlight.get(guildId) === registration) {
        this.guildCommandRegistrationInFlight.delete(guildId);
      }
    }
  }

  async registerSlashCommands(
    botToken: string,
    clientId: string,
    commandScope: DiscordCommandScope = 'auto',
  ): Promise<void> {
    if (!clientId) return;
    const payload = buildDiscordSlashCommandsJson();
    const guildIds = this.client ? [...this.client.guilds.cache.keys()].sort() : [];
    const useGlobal = commandScope === 'global' || (commandScope === 'auto' && guildIds.length === 0);
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify({ payload, guildIds: useGlobal ? [] : guildIds, useGlobal }))
      .digest('hex');
    if (this.lastRegisteredCommandHash === hash) {
      return;
    }

    const rest = new REST().setToken(botToken);

    if (useGlobal) {
      await rest.put(Routes.applicationCommands(clientId), { body: payload });
      this.status.commandsScope = 'global';
    } else {
      for (const guildId of guildIds) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: payload });
      }
      this.status.commandsScope = 'guild';
    }

    this.lastRegisteredCommandHash = hash;
    this.status.commandsRegisteredCount = payload.length;
  }

  async stop(): Promise<void> {
    if (this.controlPollTimer) clearInterval(this.controlPollTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.controlPollTimer = null;
    this.statusTimer = null;
    const guildIds = this.client ? [...this.client.guilds.cache.keys()].sort() : [];
    if (this.controlPoll) await this.controlPoll;
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.status.connected = false;
    this.status.mode = 'standby_no_token';
    await this.persistRuntimeStatus(guildIds);
  }

  async start(
    botToken: string,
    clientId: string,
    commandScope: DiscordCommandScope = 'auto',
  ): Promise<void> {
    if (!botToken) throw new Error('DISCORD_BOT_TOKEN is required to start the Discord bot.');
    if (!clientId) throw new Error('DISCORD_CLIENT_ID is required to register Discord slash commands.');

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [Partials.Message, Partials.Reaction, Partials.User],
    });

    let rejectReady!: (err: unknown) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      rejectReady = reject;
      this.client!.once(Events.ClientReady, async (readyClient) => {
        this.status = {
          connected: true,
          mode: 'live_gateway',
          botTag: readyClient.user.tag,
          guildCount: readyClient.guilds.cache.size,
          lastError: null,
          startedAt: new Date().toISOString(),
          commandsScope: this.status.commandsScope,
          commandsRegisteredCount: this.status.commandsRegisteredCount,
        };

        try {
          await this.registerSlashCommands(botToken, clientId, commandScope);

          for (const discordGuild of readyClient.guilds.cache.values()) {
            await this.synchronizeGuildState(discordGuild);
          }
          this.status.guildCount = readyClient.guilds.cache.size;
          await this.persistRuntimeStatus();
          this.startBotControlPolling();
          resolve();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.status.lastError = msg;
          await this.auditRuntimeError(`Slash command registration or startup discovery failed: ${msg}`);
          reject(err);
        }
      });
    });

    this.client.on(Events.GuildMemberUpdate, (_oldMember, newMember) => {
      void this.syncLiveMemberRolesToDb(newMember, false);
    });

    this.client.on(Events.GuildCreate, (guild) => {
      void (async () => {
        console.log(`[ShadowSlayers] Detected guild availability/join: ${guild.name} (${guild.id}).`);
        await this.synchronizeGuildState(guild);

        // Global commands are already available in every guild. In auto/guild mode,
        // register directly for this guild instead of depending on the full cache
        // being refreshed and re-hashing every guild on the client.
        if (commandScope !== 'global') {
          await this.registerSlashCommandsForGuild(botToken, clientId, guild.id);
        }

        this.status.guildCount = this.client?.guilds.cache.size ?? 0;
        this.status.lastError = null;
        await this.persistRuntimeStatus();
      })().catch((err) => {
        this.status.lastError = err instanceof Error ? err.message : String(err);
        console.error(`[ShadowSlayers] Could not initialize newly available guild ${guild.id}:`, err);
        void this.persistRuntimeStatus().catch((statusError) => {
          console.error('[ShadowSlayers] Could not publish guild initialization error:', statusError);
        });
      });
    });

    this.client.on(Events.GuildDelete, () => {
      this.status.guildCount = this.client?.guilds.cache.size ?? 0;
      void this.persistRuntimeStatus().catch((err) => {
        console.error('[ShadowSlayers] Could not publish updated bot guild list:', err);
      });
    });

    this.client.on(Events.GuildMemberRemove, (member) => {
      if ('roles' in member) {
        void this.syncLiveMemberRolesToDb(member as GuildMember, true);
      }
    });

    this.client.on(Events.Error, (err) => {
      this.status.lastError = err.message;
      rejectReady(err);
      void this.auditRuntimeError(`Discord Gateway error: ${err.message}`).catch((auditError) => {
        console.error('[ShadowSlayers] Could not audit Discord Gateway error:', auditError);
      });
      void this.persistRuntimeStatus().catch((statusError) => {
        console.error('[ShadowSlayers] Could not publish bot Gateway error status:', statusError);
      });
    });

    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => null);
      const guild = reaction.message.guild;
      if (!guild) return;
      const chName = 'name' in reaction.message.channel && reaction.message.channel.name ? reaction.message.channel.name : '';
      await this.handleRulesReactionChange(
        reaction.message.id,
        chName,
        reaction.emoji.name,
        user.id,
        user.username || user.id,
        true,
        guild,
      );
    });

    this.client.on(Events.MessageReactionRemove, async (reaction, user) => {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => null);
      const guild = reaction.message.guild;
      if (!guild) return;
      const chName = 'name' in reaction.message.channel && reaction.message.channel.name ? reaction.message.channel.name : '';
      await this.handleRulesReactionChange(
        reaction.message.id,
        chName,
        reaction.emoji.name,
        user.id,
        user.username || user.id,
        false,
        guild,
      );
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      const guildId = interaction.guildId;
      if (!guildId) {
        if (interaction.isRepliable()) {
          await interaction.reply({ ephemeral: true, content: 'This command is only available in a server.' });
        }
        return;
      }
      const liveGuild = interaction.guild ?? this.getLiveDiscordGuild(guildId);
      const memberRoles =
        interaction.member && 'roles' in interaction.member && 'cache' in interaction.member.roles
          ? [...interaction.member.roles.cache.values()].map((r) => r.name)
          : [];
      const actorRank = resolveClanRankFromRoleNames(memberRoles);

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('setup:') && liveGuild) {
          await dispatchLiveSetupButton(interaction, {
            guildId,
            actorUserId: interaction.user.id,
            actorUsername: interaction.user.username,
            actorRank,
            discordGuild: liveGuild as unknown as GuildLike,
            db: this.db,
          });
          return;
        }
        if (interaction.customId === 'onboarding:active_player' && liveGuild) {
          const guildState = await this.db.getGuild(guildId);
          if (!guildState) {
            await interaction.reply({ ephemeral: true, content: 'Guild state missing.' });
            return;
          }
          const cloned = JSON.parse(JSON.stringify(guildState)) as typeof guildState;
          const res = grantActivePlayerRecruit(cloned, {
            userId: interaction.user.id,
            username: interaction.user.username,
            actualDiscordRoleNames: memberRoles,
          });
          if (res.ok && res.grantedRole) {
            const roleGrant = await this.grantRoleOnDiscord(
              liveGuild,
              interaction.user.id,
              res.grantedRole,
              'Step 5 active-player onboarding action',
            );
            if (!roleGrant.ok) {
              await interaction.reply({ ephemeral: true, content: roleGrant.error || 'Could not assign 🌱 Recruit role.' });
              return;
            }
          }
          if (res.ok) {
            await this.db.saveGuild(cloned);
          }
          await interaction.reply({ ephemeral: true, content: res.reason });
          return;
        }
        if (interaction.customId.startsWith('rolepanel:') && liveGuild && interaction.member && 'roles' in interaction.member) {
          const res = await this.handleRolePanelButton(
            interaction.customId,
            interaction.member as GuildMember,
            liveGuild,
          );
          await interaction.reply({ ephemeral: true, content: res.message });
          return;
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'setup' && liveGuild) {
        await handleLiveSlashSetup(interaction, {
          guildId,
          actorUserId: interaction.user.id,
          actorUsername: interaction.user.username,
          actorRank,
          discordGuild: liveGuild as unknown as GuildLike,
          db: this.db,
        });
        return;
      }

      const sub = interaction.options.getSubcommand(false);
      const fullName = sub ? `${interaction.commandName} ${sub}` : interaction.commandName;
      const args = extractDiscordInteractionArgs(interaction.options.data);

      try {
        const result = await executeSlashCommand(fullName, {
          guildId,
          actorUserId: interaction.user.id,
          actorUsername: interaction.user.username,
          actorRank,
          locale: interaction.locale.slice(0, 2) || 'en',
          channelName:
            interaction.channel && 'name' in interaction.channel && interaction.channel.name
              ? interaction.channel.name
              : 'unknown',
          args,
          db: this.db,
          discordExecutor: liveGuild ? this.buildDiscordExecutor(liveGuild) : undefined,
        });

        await interaction.reply({
          content: `**${result.title}**\n${result.message}`,
          ephemeral: !result.ok,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unexpected command execution failure.';
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `**Command Error**\n${msg}`,
            ephemeral: true,
          }).catch(() => undefined);
        }
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot || !message.guild) return;
      const guildId = message.guild.id;
      const guild = await this.db.getGuild(guildId);
      if (!guild) return;

      const channelName = 'name' in message.channel && message.channel.name ? message.channel.name : 'unknown';
      const userRoles = message.member?.roles.cache.map((r) => r.name) ?? [];

      const modEval = this.automod.evaluateMessage(guild.automod, {
        userId: message.author.id,
        username: message.author.username,
        content: message.content,
        channelName,
        userRoles,
        mentionCount: message.mentions.users.size + message.mentions.roles.size,
      });

      if (modEval.triggered) {
        if (modEval.recommendedActions.includes('delete') && message.deletable) {
          await message.delete().catch(() => undefined);
        }
        await this.db.appendAuditLog(guildId, {
          id: `log-automod-${Date.now()}`,
          guildId,
          category: 'automod',
          actorId: 'automod',
          actorName: 'RuleBasedAutoMod',
          targetId: message.author.id,
          targetName: message.author.username,
          summary: modEval.reason || 'AutoMod action triggered',
          details: { channelName, rules: modEval.ruleHits.join(',') },
          createdAt: new Date().toISOString(),
        });
        return;
      }

      // Deterministic custom responses (zero AI)
      const lowerContent = message.content.trim().toLowerCase();
      const matchedRule = guild.customResponses.find((r) => {
        if (!r.enabled) return false;
        const t = r.trigger.trim().toLowerCase();
        if (!t) return false;
        if (r.matchMode === 'exact') return lowerContent === t;
        if (r.matchMode === 'startsWith') return lowerContent.startsWith(t);
        return lowerContent.includes(t);
      });
      if (matchedRule && 'reply' in message) {
        await message.reply({ content: matchedRule.response }).catch(() => undefined);
      }

      const member = guild.members.find((m) => m.userId === message.author.id);
      if (member) {
        const xpOutcome = evaluateXpAward(member, guild.progression, message.content);
        if (xpOutcome.awarded) {
          member.xp = xpOutcome.newXp;
          member.level = xpOutcome.newLevel;
          member.messagesCount += 1;
          member.lastXpAt = new Date().toISOString();
          member.lastActiveAt = new Date().toISOString();
          member.lastMessageHash = hashMessageContent(message.content);
          await this.db.saveGuild(guild);
        }
      }
    });

    try {
      const loginPromise = this.client.login(botToken);
      await Promise.all([loginPromise, readyPromise]);
    } catch (err) {
      this.status.connected = false;
      this.status.lastError = err instanceof Error ? err.message : String(err);
      await this.stop();
      throw err;
    }
  }
}
