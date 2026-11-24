import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import type { DatabaseAdapter } from '../../../packages/database/src/adapter.ts';
import type { ClanRankName } from '../../../packages/shared/src/types.ts';
import { CLAN_RANK_ORDER } from '../../../packages/shared/src/types.ts';
import { buildDiscordSlashCommandsJson, executeSlashCommand } from './commands/registry.ts';
import { RuleBasedAutoModEngine } from './services/automod.ts';
import { discoverLiveDiscordGuild } from './services/discovery.ts';
import { evaluateXpAward, hashMessageContent } from './services/xp.ts';

export interface BotRuntimeStatus {
  connected: boolean;
  mode: 'live_gateway' | 'standby_no_token';
  botTag: string | null;
  guildCount: number;
  lastError: string | null;
  startedAt: string | null;
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
        GatewayIntentBits.GuildVoiceStates,
      ],
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

        const primaryDiscordGuild = readyClient.guilds.cache.first();
        if (primaryDiscordGuild) {
          const guild = await this.db.getGuild(this.guildId);
          if (guild) {
            guild.discovery = discoverLiveDiscordGuild(primaryDiscordGuild, guild.discovery);
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

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      const sub = interaction.options.getSubcommand(false);
      const fullName = sub ? `${interaction.commandName} ${sub}` : interaction.commandName;

      const memberRoles = interaction.member && 'roles' in interaction.member && 'cache' in interaction.member.roles
        ? [...interaction.member.roles.cache.values()].map((r) => r.name)
        : [];
      const actorRank =
        CLAN_RANK_ORDER.find((r) => memberRoles.includes(r)) ?? ('Recruit' as ClanRankName);

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
        channelName: interaction.channel && 'name' in interaction.channel && interaction.channel.name ? interaction.channel.name : 'unknown',
        args,
        db: this.db,
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
