import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type Guild,
  type GuildMember,
} from 'discord.js';
import type { DatabaseAdapter } from '../../../packages/database/src/adapter.ts';
import {
  applySelfRoleSelection,
  canBotManageRolePosition,
  canBotModerateMemberPosition,
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
}

function resolveMemberClanRank(memberRoles: string[]): ClanRankName {
  for (const rank of CLAN_RANK_ORDER) {
    const spec = LEGACY_ROLE_SPECS.find((r) => r.name === rank);
    const aliases = spec ? [rank, ...spec.aliases] : [rank];
    if (memberRoles.some((mr) => aliases.some((a) => a.toLowerCase() === mr.trim().toLowerCase()))) {
      return rank;
    }
  }
  return '🌱 Recruit';
}

export class ShadowSlayersBotClient {
  private client: Client | null = null;
  private readonly automod = new RuleBasedAutoModEngine();
  private readonly db: DatabaseAdapter;
  private readonly guildId: string;
  private status: BotRuntimeStatus = {
    connected: false,
    mode: 'standby_no_token',
    botTag: null,
    guildCount: 0,
    lastError: null,
    startedAt: null,
  };

  constructor(db: DatabaseAdapter, guildId: string) {
    this.db = db;
    this.guildId = guildId;
  }

  getStatus(): BotRuntimeStatus {
    return { ...this.status };
  }

  getLiveDiscordGuild(): Guild | null {
    if (!this.client || !this.status.connected) return null;
    return this.client.guilds.cache.get(this.guildId) ?? this.client.guilds.cache.first() ?? null;
  }

  async rescanLiveGuild(existing: ServerDiscoverySnapshot): Promise<ServerDiscoverySnapshot | null> {
    const liveGuild = this.getLiveDiscordGuild();
    if (!liveGuild) return null;
    await liveGuild.roles.fetch();
    await liveGuild.channels.fetch();
    return discoverLiveDiscordGuild(liveGuild as unknown as GuildLike, existing);
  }

  async applySetupOnLiveGuild(
    existing: ServerDiscoverySnapshot,
    options: { mode: 'missing_only' | 'full_setup'; actorUsername: string },
  ): Promise<SetupExecutionReport | null> {
    const liveGuild = this.getLiveDiscordGuild();
    if (!liveGuild) return null;
    return executeAdditiveSetupOnDiscordGuild(liveGuild as unknown as GuildLike, existing, options);
  }

  buildDiscordExecutor(liveGuild: Guild): DiscordCommandExecutor {
    return {
      executeModeration: async ({ action, targetUserId, reason, durationMinutes, channelName }) => {
        return this.executeLiveModeration(liveGuild, { action, targetUserId, reason, durationMinutes, channelName });
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

  async publishRulesToDiscord(
    liveGuild: Guild,
    params: { channelName: string; title: string; body: string; reactionEmoji: string },
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    try {
      const targetChannel = liveGuild.channels.cache.find(
        (c) =>
          (c.name === params.channelName || c.name === '📜・rules' || c.name === 'rules') &&
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
        const ch = liveGuild.channels.cache.find((c) => c.name === params.channelName && c.isTextBased());
        if (!ch || !('permissionOverwrites' in ch)) {
          return { ok: false, error: `Text channel #${params.channelName} not found on Discord.` };
        }
        if (params.action === 'lock') {
          await ch.permissionOverwrites.edit(liveGuild.id, { SendMessages: false }, { reason: params.reason });
        } else if (params.action === 'unlock') {
          await ch.permissionOverwrites.edit(liveGuild.id, { SendMessages: null }, { reason: params.reason });
        } else if (params.action === 'slowmode' && 'setRateLimitPerUser' in ch) {
          await ch.setRateLimitPerUser(params.durationMinutes ?? 10, params.reason);
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
        await liveGuild.members.ban(params.targetUserId, { reason: params.reason });
        return { ok: true };
      }
      return { ok: false, error: `Unsupported live moderation action: ${params.action}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async publishRolePanelToDiscord(liveGuild: Guild, panel: RolePanel): Promise<{ ok: boolean; error?: string }> {
    try {
      const targetChannel = liveGuild.channels.cache.find(
        (c) => c.name === panel.channelName && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement),
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

      await targetChannel.send({
        content: `**${panel.title}**\n${panel.description}\n_Mode: ${panel.groupType === 'exclusive' ? 'Exclusive (one active role)' : 'Multiple selections allowed'}_`,
        components: row.components.length > 0 ? [row] : [],
      });
      return { ok: true };
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
    const guildState = await this.db.getGuild(this.guildId);
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

    let memberRec = guildState.members.find((m) => m.userId === member.id);
    if (!memberRec) {
      memberRec = {
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        avatarUrl: member.displayAvatarURL(),
        clanRank: resolveMemberClanRank([...member.roles.cache.values()].map((r) => r.name)),
        hasClanRank: [...member.roles.cache.values()].some((r) =>
          CLAN_RANK_ORDER.includes(r.name as ClanRankName),
        ),
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
    await this.db.appendAuditLog(this.guildId, {
      id: `log-selfrole-${Date.now()}`,
      guildId: this.guildId,
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
    const guildState = await this.db.getGuild(this.guildId);
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

    if (resolvedVerified.matched && canBotManageRolePosition(botHighest, resolvedVerified.matched.position)) {
      if (added && !member.roles.cache.has(resolvedVerified.matched.id)) {
        await member.roles.add(resolvedVerified.matched.id, '📜・rules ✅ reaction verification');
      } else if (!added && member.roles.cache.has(resolvedVerified.matched.id)) {
        await member.roles.remove(resolvedVerified.matched.id, 'Removed ✅ rules verification reaction (unrelated roles preserved)');
      }
    }

    applyRulesVerificationReaction(guildState, { userId, username, added });
    await this.db.saveGuild(guildState);
    await this.db.appendAuditLog(this.guildId, {
      id: `log-rulesverify-${Date.now()}`,
      guildId: this.guildId,
      category: 'role_change',
      actorId: userId,
      actorName: username,
      targetId: resolvedVerified.matched?.id ?? null,
      targetName: '✅ Verified',
      summary: added
        ? `${username} accepted 📜・rules (${expectedEmoji}) and received ✅ Verified.`
        : `${username} removed ${expectedEmoji} in 📜・rules; ✅ Verified removed while preserving all unrelated roles.`,
      details: { added, channelName },
      createdAt: new Date().toISOString(),
    });
  }

  async start(botToken: string, clientId: string): Promise<void> {
    if (!botToken) {
      this.status.mode = 'standby_no_token';
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [Partials.Message, Partials.Reaction, Partials.User],
    });

    this.client.once(Events.ClientReady, async (readyClient) => {
      this.status = {
        connected: true,
        mode: 'live_gateway',
        botTag: readyClient.user.tag,
        guildCount: readyClient.guilds.cache.size,
        lastError: null,
        startedAt: new Date().toISOString(),
      };

      try {
        if (clientId) {
          const rest = new REST().setToken(botToken);
          await rest.put(Routes.applicationCommands(clientId), {
            body: buildDiscordSlashCommandsJson(),
          });
        }

        const primaryDiscordGuild = this.getLiveDiscordGuild();
        if (primaryDiscordGuild) {
          const guild = await this.db.getGuild(this.guildId);
          if (guild) {
            guild.discovery = discoverLiveDiscordGuild(primaryDiscordGuild as unknown as GuildLike, guild.discovery);
            await this.db.saveGuild(guild);
          }
        }
      } catch (err) {
        this.status.lastError = err instanceof Error ? err.message : String(err);
      }
    });

    this.client.on(Events.Error, (err) => {
      this.status.lastError = err.message;
      void this.db.appendAuditLog(this.guildId, {
        id: `log-boterr-${Date.now()}`,
        guildId: this.guildId,
        category: 'bot_error',
        actorId: 'bot',
        actorName: 'Discord Gateway',
        targetId: null,
        targetName: null,
        summary: `Discord Gateway error: ${err.message}`,
        details: {},
        createdAt: new Date().toISOString(),
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
      const liveGuild = interaction.guild ?? this.getLiveDiscordGuild();
      const memberRoles =
        interaction.member && 'roles' in interaction.member && 'cache' in interaction.member.roles
          ? [...interaction.member.roles.cache.values()].map((r) => r.name)
          : [];
      const actorRank = resolveMemberClanRank(memberRoles);

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('setup:') && liveGuild) {
          await dispatchLiveSetupButton(interaction, {
            guildId: this.guildId,
            actorUserId: interaction.user.id,
            actorUsername: interaction.user.username,
            actorRank,
            discordGuild: liveGuild as unknown as GuildLike,
            db: this.db,
          });
          return;
        }
        if (interaction.customId === 'onboarding:active_player' && liveGuild) {
          const guildState = await this.db.getGuild(this.guildId);
          if (!guildState) {
            await interaction.reply({ ephemeral: true, content: 'Guild state missing.' });
            return;
          }
          const res = grantActivePlayerRecruit(guildState, {
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
            await this.db.saveGuild(guildState);
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
          guildId: this.guildId,
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

      const args: Record<string, string | number | boolean> = {};
      for (const opt of interaction.options.data) {
        if (opt.value !== undefined) args[opt.name] = opt.value;
      }

      const result = await executeSlashCommand(fullName, {
        guildId: this.guildId,
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
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot || !message.guild) return;
      const guild = await this.db.getGuild(this.guildId);
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
        await this.db.appendAuditLog(this.guildId, {
          id: `log-automod-${Date.now()}`,
          guildId: this.guildId,
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

    await this.client.login(botToken).catch((err) => {
      this.status.connected = false;
      this.status.lastError = err instanceof Error ? err.message : String(err);
    });
  }
}
