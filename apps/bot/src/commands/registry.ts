import { SlashCommandBuilder } from 'discord.js';
import type { DatabaseAdapter } from '../../../../packages/database/src/adapter.ts';
import {
  applySelfRoleSelection,
  canActOnTargetRank,
  hasCapability,
  type PermissionCapability,
} from '../../../../packages/permissions/src/hierarchy.ts';
import type {
  ClanRankName,
  GuildState,
  ModerationActionType,
  RolePanel,
} from '../../../../packages/shared/src/types.ts';
import { formatLocalizedString } from '../../../../packages/localization/src/engine.ts';
import { RuleBasedAutoModEngine } from '../services/automod.ts';
import { computeMemberOnboardingStatus, grantActivePlayerRecruit } from '../services/onboarding.ts';

export type CommandCategory =
  | 'General'
  | 'Setup & Administration'
  | 'Roles'
  | 'Moderation'
  | 'AutoMod'
  | 'Community'
  | 'Recruitment'
  | 'Support'
  | 'Clan';

export interface CommandDescriptor {
  name: string;
  category: CommandCategory;
  description: string;
  requiredCapability: PermissionCapability;
  optionsSummary: string[];
}

export interface DiscordCommandExecutor {
  executeModeration?: (params: {
    action: ModerationActionType;
    targetUserId: string;
    reason: string;
    durationMinutes: number | null;
    channelName: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  publishRolePanel?: (panel: RolePanel) => Promise<{ ok: boolean; error?: string }>;
  publishRulesMessage?: (params: {
    channelName: string;
    title: string;
    body: string;
    reactionEmoji: string;
  }) => Promise<{ ok: boolean; messageId?: string; error?: string }>;
  grantDiscordRole?: (params: { userId: string; roleName: string; reason: string }) => Promise<{ ok: boolean; error?: string }>;
  getLiveMemberRoleNames?: (userId: string) => Promise<string[] | null>;
  getBotRuntimeSummary?: () => { connected: boolean; mode: string; botTag: string | null; guildCount: number };
}

export interface CommandExecutionContext {
  guildId: string;
  actorUserId: string;
  actorUsername: string;
  actorRank: ClanRankName;
  locale: string;
  channelName: string;
  args: Record<string, string | number | boolean>;
  db: DatabaseAdapter;
  discordExecutor?: DiscordCommandExecutor;
}

export interface CommandExecutionResult {
  ok: boolean;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

const DESTRUCTIVE_MOD_ACTIONS = new Set<ModerationActionType>(['ban', 'kick', 'purge']);

export const SLASH_COMMANDS: CommandDescriptor[] = [
  // General
  { name: 'help', category: 'General', description: 'List categorized ShadowSlayers commands', requiredCapability: 'overview.view', optionsSummary: ['category?'] },
  { name: 'about', category: 'General', description: 'Show platform architecture and realm details', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'bot-status', category: 'General', description: 'Check bot gateway, database, and module operational status', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'profile', category: 'General', description: 'Inspect member XP, level, clan rank, and languages', requiredCapability: 'overview.view', optionsSummary: ['member?'] },
  { name: 'userinfo', category: 'General', description: 'Inspect member roles, verification, and onboarding state', requiredCapability: 'overview.view', optionsSummary: ['member?'] },
  { name: 'avatar', category: 'General', description: 'Display member avatar URL and identity badge', requiredCapability: 'overview.view', optionsSummary: ['member?'] },
  { name: 'server', category: 'General', description: 'Display discovered server categories and role summary', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'serverinfo', category: 'General', description: 'Show detailed ShadowSlayers server structure and member counts', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'language', category: 'General', description: 'Toggle or view your independent language roles', requiredCapability: 'overview.view', optionsSummary: ['code?'] },
  { name: 'onboarding', category: 'General', description: 'Inspect 5-step onboarding status or claim 🌱 Recruit when eligible', requiredCapability: 'overview.view', optionsSummary: ['member?', 'action?'] },
  { name: 'modules', category: 'General', description: 'List enabled and disabled bot modules', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'dashboard', category: 'General', description: 'Get the administration dashboard link', requiredCapability: 'overview.view', optionsSummary: [] },
  // Setup & Administration
  { name: 'setup', category: 'Setup & Administration', description: 'Run non-destructive server discovery & diff preview', requiredCapability: 'discovery.apply', optionsSummary: ['confirm?'] },
  { name: 'config', category: 'Setup & Administration', description: 'View or toggle core guild module settings', requiredCapability: 'settings.manage', optionsSummary: ['module?', 'enabled?'] },
  { name: 'permissions', category: 'Setup & Administration', description: 'Inspect clan rank hierarchy and permissions', requiredCapability: 'discovery.view', optionsSummary: [] },
  { name: 'permissions preview', category: 'Setup & Administration', description: 'Preview permission audit differences, read-only guards, and Inner Sanctum isolation', requiredCapability: 'discovery.view', optionsSummary: [] },
  { name: 'rules publish', category: 'Setup & Administration', description: 'Publish localized rules embed & ✅ reaction gate to 📜・rules', requiredCapability: 'roles.publish', optionsSummary: ['channel?'] },
  { name: 'custom-response', category: 'Setup & Administration', description: 'List or add deterministic keyword custom responses', requiredCapability: 'community.manage', optionsSummary: ['action?', 'trigger?', 'response?'] },
  // Roles
  { name: 'roles', category: 'Roles', description: 'List configured role panels and role groups', requiredCapability: 'roles.view', optionsSummary: [] },
  { name: 'roles publish', category: 'Roles', description: 'Publish a configured role-selection panel only (never server setup)', requiredCapability: 'roles.publish', optionsSummary: ['panelId'] },
  // AutoMod
  { name: 'automod status', category: 'AutoMod', description: 'Display deterministic AutoMod rules, lockdown, and false-positive queue', requiredCapability: 'moderation.view', optionsSummary: [] },
  { name: 'automod test', category: 'AutoMod', description: 'Test a sample message against deterministic AutoMod rules', requiredCapability: 'automod.manage', optionsSummary: ['content', 'channel?'] },
  { name: 'false-positive', category: 'AutoMod', description: 'Report an AutoMod false-positive match for moderator review', requiredCapability: 'overview.view', optionsSummary: ['channel', 'content', 'notes'] },
  // Moderation
  { name: 'warn', category: 'Moderation', description: 'Issue a warning and create a moderation case', requiredCapability: 'moderation.execute', optionsSummary: ['member', 'reason'] },
  { name: 'warnings', category: 'Moderation', description: 'List warnings for a target member', requiredCapability: 'moderation.view', optionsSummary: ['member'] },
  { name: 'timeout', category: 'Moderation', description: 'Timeout a member for N minutes', requiredCapability: 'moderation.execute', optionsSummary: ['member', 'minutes', 'reason'] },
  { name: 'untimeout', category: 'Moderation', description: 'Remove an active timeout', requiredCapability: 'moderation.execute', optionsSummary: ['member', 'reason'] },
  { name: 'kick', category: 'Moderation', description: 'Kick a member with logged reason and confirmation check', requiredCapability: 'moderation.execute', optionsSummary: ['member', 'reason', 'confirmed?'] },
  { name: 'ban', category: 'Moderation', description: 'Permanently ban a member with logged case and confirmation check', requiredCapability: 'moderation.execute', optionsSummary: ['member', 'reason', 'confirmed?'] },
  { name: 'tempban', category: 'Moderation', description: 'Temporarily ban a member and schedule unban', requiredCapability: 'moderation.execute', optionsSummary: ['member', 'minutes', 'reason'] },
  { name: 'unban', category: 'Moderation', description: 'Revoke a ban by user ID', requiredCapability: 'moderation.execute', optionsSummary: ['userId', 'reason'] },
  { name: 'purge', category: 'Moderation', description: 'Bulk remove messages with audit record and confirmation check', requiredCapability: 'moderation.execute', optionsSummary: ['count', 'channel?', 'confirmed?'] },
  { name: 'slowmode', category: 'Moderation', description: 'Set channel slowmode seconds', requiredCapability: 'moderation.execute', optionsSummary: ['seconds', 'channel?'] },
  { name: 'lock', category: 'Moderation', description: 'Lock a channel against regular member messages', requiredCapability: 'moderation.execute', optionsSummary: ['channel', 'reason'] },
  { name: 'unlock', category: 'Moderation', description: 'Unlock a previously locked channel', requiredCapability: 'moderation.execute', optionsSummary: ['channel', 'reason'] },
  { name: 'modlog', category: 'Moderation', description: 'Display recent moderation cases', requiredCapability: 'moderation.view', optionsSummary: ['limit?'] },
  { name: 'case', category: 'Moderation', description: 'View details for a specific moderation case ID', requiredCapability: 'moderation.view', optionsSummary: ['caseId'] },
  { name: 'appeal', category: 'Moderation', description: 'Submit an appeal for an existing moderation case', requiredCapability: 'overview.view', optionsSummary: ['caseId', 'reason'] },
  // Community
  { name: 'suggest', category: 'Community', description: 'Submit a community suggestion for voting', requiredCapability: 'overview.view', optionsSummary: ['title', 'description'] },
  { name: 'poll', category: 'Community', description: 'Create a community poll', requiredCapability: 'community.manage', optionsSummary: ['question', 'options'] },
  { name: 'giveaway', category: 'Community', description: 'Start a timed giveaway with scheduled draw', requiredCapability: 'community.manage', optionsSummary: ['prize', 'minutes'] },
  { name: 'event', category: 'Community', description: 'Create a scheduled community or raid event', requiredCapability: 'community.manage', optionsSummary: ['title', 'type'] },
  { name: 'remind', category: 'Community', description: 'Create a persistent reminder task', requiredCapability: 'overview.view', optionsSummary: ['minutes', 'message'] },
  // Recruitment
  { name: 'recruitment', category: 'Recruitment', description: 'List open clan, staff, and event recruitment forms', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'apply', category: 'Recruitment', description: 'Submit a recruitment application', requiredCapability: 'overview.view', optionsSummary: ['category', 'summary'] },
  { name: 'applications', category: 'Recruitment', description: 'Inspect pending recruitment applications', requiredCapability: 'recruitment.view', optionsSummary: [] },
  // Support
  { name: 'ticket', category: 'Support', description: 'Open or inspect support tickets', requiredCapability: 'overview.view', optionsSummary: ['subject'] },
  // Clan
  { name: 'clan', category: 'Clan', description: 'Overview of ShadowSlayers teams and scheduled raids', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'members', category: 'Clan', description: 'Search clan members by rank or language', requiredCapability: 'members.view', optionsSummary: ['query?'] },
  { name: 'leaderboard', category: 'Clan', description: 'View top members by XP and level', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'achievements', category: 'Clan', description: 'List clan achievements and unlock criteria', requiredCapability: 'overview.view', optionsSummary: [] },
  { name: 'activity', category: 'Clan', description: 'Review active and inactive member thresholds', requiredCapability: 'members.view', optionsSummary: [] },
];

export function buildDiscordSlashCommandsJson() {
  const uniqueTopLevel = new Map<string, SlashCommandBuilder>();
  for (const cmd of SLASH_COMMANDS) {
    const [root, sub] = cmd.name.split(' ');
    if (!uniqueTopLevel.has(root)) {
      const builder = new SlashCommandBuilder().setName(root).setDescription(cmd.description);
      if (sub) {
        builder.addSubcommand((sc) => sc.setName(sub).setDescription(cmd.description));
      }
      uniqueTopLevel.set(root, builder);
    } else if (sub) {
      uniqueTopLevel.get(root)!.addSubcommand((sc) => sc.setName(sub).setDescription(cmd.description));
    }
  }
  return [...uniqueTopLevel.values()].map((b) => b.toJSON());
}

export async function executeSlashCommand(
  commandName: string,
  ctx: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  let normalized = commandName.trim().toLowerCase().replace(/^\//, '');
  if (normalized === 'roles list') normalized = 'roles';
  if (normalized === 'permissions matrix') normalized = 'permissions';

  const descriptor = SLASH_COMMANDS.find((c) => c.name === normalized);

  if (!descriptor) {
    return {
      ok: false,
      title: 'Unknown Command',
      message: `Command "/${normalized}" is not registered in the ShadowSlayers command codex.`,
    };
  }

  const guild = await ctx.db.getGuild(ctx.guildId);
  if (!guild) {
    return { ok: false, title: 'Guild Not Found', message: `Guild "${ctx.guildId}" is not initialized.` };
  }

  const bundle = guild.translations[ctx.locale] ?? guild.translations.en;
  const fallback = guild.translations.en;

  if (!hasCapability(ctx.actorRank, descriptor.requiredCapability)) {
    return {
      ok: false,
      title: 'Permission Denied',
      message: formatLocalizedString(bundle, fallback, 'commands.no_permission'),
    };
  }

  const now = new Date().toISOString();

  switch (normalized) {
    case 'help': {
      const catFilter = String(ctx.args.category || '').toLowerCase();
      const filtered = SLASH_COMMANDS.filter((c) => !catFilter || c.category.toLowerCase().includes(catFilter));
      return {
        ok: true,
        title: formatLocalizedString(bundle, fallback, 'commands.help_header'),
        message: `${filtered.length} commands available across ${new Set(filtered.map((c) => c.category)).size} categories.`,
        data: { commands: filtered.map((c) => ({ name: `/${c.name}`, category: c.category, description: c.description })) },
      };
    }

    case 'about':
      return {
        ok: true,
        title: 'ShadowSlayers – Legends of Elements',
        message: 'Deterministic multi-realm Discord administration platform. Zero AI dependencies. Hosted on Lunafy + Firebase Spark / Local Adapter.',
        data: {
          categoriesDiscovered: guild.discovery.categories.length,
          rolesDiscovered: guild.discovery.roles.length,
          enabledLanguages: guild.languages.filter((l) => l.enabled).map((l) => l.code),
        },
      };

    case 'bot-status': {
      const runtime = ctx.discordExecutor?.getBotRuntimeSummary?.() ?? {
        connected: false,
        mode: 'standby_no_token',
        botTag: null,
        guildCount: 0,
      };
      const mappedRoles = guild.discovery.roles.filter((r) => r.lifecycleState === 'mapped').length;
      const mappedCats = guild.discovery.categories.filter((c) => c.lifecycleState === 'mapped').length;
      return {
        ok: true,
        title: 'ShadowSlayers Bot Status',
        message: `Gateway: ${runtime.connected ? `Connected (${runtime.botTag})` : `Standby (${runtime.mode})`} | Mapped: ${mappedRoles}/16 roles, ${mappedCats}/9 categories | Pending Tasks: ${guild.scheduledTasks.filter((t) => t.status === 'pending').length}`,
        data: {
          runtime,
          mappedRoles,
          mappedCats,
          permissionDiffs: guild.discovery.permissionDifferences.length,
        },
      };
    }

    case 'server':
    case 'serverinfo': {
      const textCount = guild.discovery.categories.reduce(
        (acc, c) => acc + c.channels.filter((ch) => ch.type !== 'voice').length,
        0,
      );
      const voiceCount = guild.discovery.categories.reduce(
        (acc, c) => acc + c.channels.filter((ch) => ch.type === 'voice').length,
        0,
      );
      return {
        ok: true,
        title: guild.guildName,
        message: `${guild.discovery.categories.length} categories, ${textCount} text / ${voiceCount} voice channels, ${guild.discovery.roles.length} roles, ${guild.members.filter((m) => !m.isDeparted).length} active tracked members.`,
      };
    }

    case 'modules':
      return {
        ok: true,
        title: 'Active Guild Modules',
        message: Object.entries(guild.modules)
          .map(([k, v]) => `${k}: ${v ? 'enabled' : 'disabled'}`)
          .join(' | '),
      };

    case 'dashboard':
      return {
        ok: true,
        title: 'Administration Dashboard',
        message: 'Access the ShadowSlayers web console at the configured APP_URL. Privileged actions require Discord OAuth2 or verified Shadow King session.',
      };

    case 'profile':
    case 'userinfo': {
      const targetName = String(ctx.args.member || ctx.actorUsername).toLowerCase();
      const member =
        guild.members.find((m) => m.username.toLowerCase() === targetName || m.userId === targetName) ??
        guild.members[0];
      const liveRoles = ctx.discordExecutor?.getLiveMemberRoleNames
        ? await ctx.discordExecutor.getLiveMemberRoleNames(member.userId)
        : null;
      const onbRec = guild.onboardingRecords.find((r) => r.userId === member.userId);
      const onb = computeMemberOnboardingStatus(member, liveRoles, onbRec);
      return {
        ok: true,
        title: `${member.displayName} (${onb.currentClanRank ?? 'Unranked'})`,
        message: `Verified: ${onb.step1RulesVerified ? '✅' : 'No'} | Level ${member.level} (${member.xp} XP) | Languages: ${member.languageCodes.join(', ') || 'none'} | Class: ${member.gamingClasses.join(', ') || 'unassigned'} | Onboarding: ${onb.completed ? 'Complete' : `${4 - onb.missingSteps.length}/4 required steps`}`,
        data: { onboarding: onb },
      };
    }

    case 'avatar': {
      const targetName = String(ctx.args.member || ctx.actorUsername).toLowerCase();
      const member =
        guild.members.find((m) => m.username.toLowerCase() === targetName || m.userId === targetName) ??
        guild.members[0];
      return {
        ok: true,
        title: `Avatar for ${member.displayName}`,
        message: member.avatarUrl ? `Avatar URL: ${member.avatarUrl}` : `${member.username} is using their default Discord avatar.`,
        data: { avatarUrl: member.avatarUrl },
      };
    }

    case 'onboarding': {
      const action = String(ctx.args.action || 'status').toLowerCase();
      const targetName = String(ctx.args.member || ctx.actorUsername).toLowerCase();
      const member =
        guild.members.find((m) => m.username.toLowerCase() === targetName || m.userId === targetName) ??
        guild.members.find((m) => m.userId === ctx.actorUserId) ??
        guild.members[0];

      const liveRoles = ctx.discordExecutor?.getLiveMemberRoleNames
        ? await ctx.discordExecutor.getLiveMemberRoleNames(member.userId)
        : null;

      if (action === 'active_player' || action === 'claim_recruit') {
        const res = grantActivePlayerRecruit(guild, {
          userId: member.userId,
          username: member.username,
          actualDiscordRoleNames: liveRoles,
          nowIso: now,
        });
        if (res.ok && res.grantedRole && ctx.discordExecutor?.grantDiscordRole) {
          const roleRes = await ctx.discordExecutor.grantDiscordRole({
            userId: member.userId,
            roleName: res.grantedRole,
            reason: 'Step 5 active-player onboarding completion',
          });
          if (!roleRes.ok) {
            return {
              ok: false,
              title: 'Discord Role Grant Failed',
              message: roleRes.error || 'Could not assign 🌱 Recruit role on Discord.',
            };
          }
        }
        if (res.ok) {
          await ctx.db.saveGuild(guild);
          await ctx.db.appendAuditLog(guild.guildId, {
            id: `log-onb-${Date.now()}`,
            guildId: guild.guildId,
            category: 'role_change',
            actorId: ctx.actorUserId,
            actorName: ctx.actorUsername,
            targetId: member.userId,
            targetName: member.username,
            summary: res.reason,
            details: { grantedRole: res.grantedRole },
            createdAt: now,
          });
        }
        return {
          ok: res.ok,
          title: res.ok ? 'Active-Player Onboarding Updated' : 'Onboarding Requirements Incomplete',
          message: res.reason,
          data: { status: res.status },
        };
      }

      const onbRec = guild.onboardingRecords.find((r) => r.userId === member.userId);
      const status = computeMemberOnboardingStatus(member, liveRoles, onbRec);
      return {
        ok: true,
        title: `Onboarding Status — ${member.username}`,
        message: [
          `1. Rules (✅ Verified): ${status.step1RulesVerified ? 'Done' : 'Pending'}`,
          `2. Language: ${status.step2LanguageSelected ?? 'Pending'}`,
          `3. Class: ${status.step3ClassSelected ?? 'Pending'}`,
          `4. Notifications (optional): ${status.step4NotificationsCount}`,
          `5. Clan Rank (🌱 Recruit): ${status.currentClanRank ?? 'Pending'}`,
        ].join(' | '),
        data: { status },
      };
    }

    case 'language': {
      const code = String(ctx.args.code || '').toLowerCase().trim();
      const enabledLangs = guild.languages.filter((l) => l.enabled);
      if (!code) {
        return {
          ok: true,
          title: 'Enabled Languages',
          message: enabledLangs.map((l) => `${l.flagEmoji} ${l.nativeName} (${l.code})`).join(' · '),
        };
      }
      const targetLang = enabledLangs.find((l) => l.code === code);
      if (!targetLang) {
        return { ok: false, title: 'Language Unavailable', message: `Language "${code}" is not currently enabled.` };
      }
      const actorMember = guild.members.find((m) => m.userId === ctx.actorUserId);
      if (actorMember) {
        if (guild.onboarding.allowMultipleLanguages) {
          if (actorMember.languageCodes.includes(code)) {
            actorMember.languageCodes = actorMember.languageCodes.filter((c) => c !== code);
          } else {
            actorMember.languageCodes.push(code);
          }
        } else {
          const applied = applySelfRoleSelection(actorMember, 'language', code);
          actorMember.languageCodes = applied.languageCodes;
        }
        await ctx.db.saveGuild(guild);
      }
      return {
        ok: true,
        title: 'Language Role Updated',
        message: `Selected ${targetLang.flagEmoji} ${targetLang.nativeName} independently of your clan rank.`,
      };
    }

    case 'setup': {
      const pending = guild.discovery.proposedChanges.filter(
        (c) => c.status === 'proposed' || c.status === 'missing' || c.status === 'failed',
      ).length;
      const conflicts = guild.discovery.proposedChanges.filter((c) => c.status === 'conflicting').length;
      const manual = guild.discovery.proposedChanges.filter((c) => c.status === 'requires_manual_setup').length;
      return {
        ok: true,
        title: 'Non-Destructive Discovery Preview',
        message: `${guild.discovery.categories.length} categories & ${guild.discovery.roles.length} roles scanned. Pending additive: ${pending}, manual review/misplaced/type diffs: ${manual}, conflicts: ${conflicts}.`,
      };
    }

    case 'config': {
      const modKey = String(ctx.args.module || '').trim() as keyof GuildState['modules'];
      if (!modKey || !(modKey in guild.modules)) {
        return {
          ok: true,
          title: 'Guild Configuration',
          message: `Modules: ${Object.entries(guild.modules).map(([k, v]) => `${k}=${v}`).join(', ')}`,
        };
      }
      const nextEnabled = typeof ctx.args.enabled === 'boolean' ? ctx.args.enabled : !guild.modules[modKey];
      guild.modules[modKey] = nextEnabled;
      await ctx.db.saveGuild(guild);
      return {
        ok: true,
        title: 'Module Configuration Updated',
        message: `Module "${modKey}" is now ${nextEnabled ? 'enabled' : 'disabled'}.`,
      };
    }

    case 'permissions':
      return {
        ok: true,
        title: 'Clan Rank Hierarchy',
        message:
          '👑 Shadow King > 🛡️ Shadow Council > ⚔️ Warlord > 🔥 Elite Warrior > 🖤 ShadowSlayer > 🌱 Recruit. Language, class, and notification roles carry zero moderation authority.',
      };

    case 'permissions preview': {
      const diffs = guild.discovery.permissionDifferences;
      const roCount = guild.discovery.categories.flatMap((c) => c.channels).filter((ch) => ch.readOnlyForMembers).length;
      return {
        ok: true,
        title: 'Permission Policy & Diff Preview',
        message:
          diffs.length === 0
            ? `No permission policy violations detected across discovered channels (${roCount} read-only channel policy checks configured).`
            : `${diffs.length} permission difference(s) detected: ${diffs.slice(0, 4).map((d) => d.summary).join(' | ')}`,
        data: { differences: diffs },
      };
    }

    case 'rules publish': {
      const targetChannel = String(ctx.args.channel || guild.onboarding.rulesChannelName || '📜・rules');
      if (ctx.discordExecutor?.publishRulesMessage) {
        const res = await ctx.discordExecutor.publishRulesMessage({
          channelName: targetChannel,
          title: guild.onboarding.rulesTitle,
          body: guild.onboarding.rulesBody,
          reactionEmoji: guild.onboarding.rulesReactionEmoji || '✅',
        });
        if (!res.ok) {
          return {
            ok: false,
            title: 'Rules Publish Failed',
            message: res.error || `Could not publish rules message to #${targetChannel}.`,
          };
        }
        if (res.messageId) guild.onboarding.rulesMessageId = res.messageId;
      }
      guild.onboarding.rulesPublishedAt = now;
      await ctx.db.saveGuild(guild);
      await ctx.db.appendAuditLog(guild.guildId, {
        id: `log-rulespub-${Date.now()}`,
        guildId: guild.guildId,
        category: 'config_change',
        actorId: ctx.actorUserId,
        actorName: ctx.actorUsername,
        targetId: targetChannel,
        targetName: targetChannel,
        summary: `Executed /rules publish to #${targetChannel} (reaction gate ${guild.onboarding.rulesReactionEmoji}; zero server setup changes).`,
        details: { liveDiscord: Boolean(ctx.discordExecutor?.publishRulesMessage), rulesMessageId: guild.onboarding.rulesMessageId },
        createdAt: now,
      });
      return {
        ok: true,
        title: 'Rules Gate Published',
        message: ctx.discordExecutor?.publishRulesMessage
          ? `Published rules & ${guild.onboarding.rulesReactionEmoji} reaction verification to #${targetChannel}.`
          : `Rules publication saved for #${targetChannel} (Discord Gateway standby — will post once connected).`,
      };
    }

    case 'custom-response': {
      const action = String(ctx.args.action || 'list').toLowerCase();
      if (action === 'add') {
        const trigger = String(ctx.args.trigger || '').trim();
        const response = String(ctx.args.response || '').trim();
        if (!trigger || !response) {
          return { ok: false, title: 'Missing Arguments', message: 'Provide both trigger and response text.' };
        }
        guild.customResponses.unshift({
          id: `cr-${Date.now()}`,
          trigger,
          matchMode: 'contains',
          response,
          enabled: true,
          languageCode: null,
          createdBy: ctx.actorUsername,
          createdAt: now,
        });
        await ctx.db.saveGuild(guild);
        return { ok: true, title: 'Custom Response Added', message: `Trigger "${trigger}" saved (deterministic match, no AI).` };
      }
      return {
        ok: true,
        title: `Custom Responses (${guild.customResponses.length})`,
        message:
          guild.customResponses.length === 0
            ? 'No custom responses configured yet.'
            : guild.customResponses.map((r) => `[${r.enabled ? 'ON' : 'OFF'}] "${r.trigger}" -> ${r.response.slice(0, 60)}`).join(' | '),
      };
    }

    case 'roles':
      return {
        ok: true,
        title: 'Configured Role Panels',
        message: guild.rolePanels.map((p) => `${p.title} [${p.mode}/${p.groupType}] (${p.published ? 'Published' : 'Draft'})`).join(' | '),
      };

    case 'roles publish': {
      const panelId = String(ctx.args.panelId || guild.rolePanels[0]?.id || '');
      const panel = guild.rolePanels.find((p) => p.id === panelId);
      if (!panel) {
        return { ok: false, title: 'Panel Not Found', message: `Role panel "${panelId}" does not exist.` };
      }

      if (ctx.discordExecutor?.publishRolePanel) {
        const pubRes = await ctx.discordExecutor.publishRolePanel(panel);
        if (!pubRes.ok) {
          return {
            ok: false,
            title: 'Discord Publish Failed',
            message: pubRes.error || `Failed to publish panel "${panel.title}" to #${panel.channelName}.`,
          };
        }
      }

      panel.published = true;
      panel.publishedAt = now;
      await ctx.db.saveGuild(guild);
      await ctx.db.appendAuditLog(guild.guildId, {
        id: `log-rolepub-${Date.now()}`,
        guildId: guild.guildId,
        category: 'role_change',
        actorId: ctx.actorUserId,
        actorName: ctx.actorUsername,
        targetId: panel.id,
        targetName: panel.title,
        summary: `Published role panel "${panel.title}" to #${panel.channelName} (panel publish only; no server setup run).`,
        details: {
          mode: panel.mode,
          itemsCount: panel.items.length,
          liveDiscord: Boolean(ctx.discordExecutor?.publishRolePanel),
        },
        createdAt: now,
      });
      return {
        ok: true,
        title: 'Role Panel Published',
        message: ctx.discordExecutor?.publishRolePanel
          ? `Published "${panel.title}" live to #${panel.channelName} without altering any other server structure.`
          : `Marked "${panel.title}" ready for #${panel.channelName} in database (live Discord gateway standby — will post once bot connects).`,
      };
    }

    case 'automod status': {
      const openFp = guild.falsePositiveReports.filter((r) => r.status === 'open').length;
      return {
        ok: true,
        title: 'Deterministic AutoMod Status',
        message: `Enabled: ${guild.automod.enabled} | Emergency Lockdown: ${guild.automod.emergencyLockdown} | Invites Blocked: ${guild.automod.blockDiscordInvites} | Phishing Links: ${guild.automod.blockSuspiciousLinks} | Open False Positives: ${openFp} | Never Auto-Permaban: ${guild.automod.neverAutoPermaban}`,
      };
    }

    case 'automod test': {
      const engine = new RuleBasedAutoModEngine();
      const content = String(ctx.args.content || 'Check this sample message');
      const ch = String(ctx.args.channel || ctx.channelName || '💬・general-chat');
      const res = engine.evaluateMessage(guild.automod, {
        userId: 'sim-test',
        username: ctx.actorUsername,
        content,
        channelName: ch,
        userRoles: ['🌱 Recruit'],
        mentionCount: Number(ctx.args.mentions || 0),
      });
      return {
        ok: true,
        title: 'AutoMod Rule Evaluation',
        message: res.exempt
          ? `Channel #${ch} is exempt.`
          : res.triggered
            ? `Triggered [${res.ruleHits.join(', ')}] -> Actions: ${res.recommendedActions.join(', ')}`
            : 'No AutoMod rules triggered.',
        data: { evaluation: res },
      };
    }

    case 'false-positive': {
      const channelName = String(ctx.args.channel || ctx.channelName || '💬・general-chat');
      const sampleContent = String(ctx.args.content || 'Flagged message content');
      const notes = String(ctx.args.notes || 'Reported via /false-positive');
      const report = {
        id: `fp-${Date.now()}`,
        reporterUserId: ctx.actorUserId,
        reporterUsername: ctx.actorUsername,
        channelName,
        sampleContent,
        ruleHits: String(ctx.args.rules || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notes,
        status: 'open' as const,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
      };
      guild.falsePositiveReports.unshift(report);
      await ctx.db.saveGuild(guild);
      await ctx.db.appendAuditLog(guild.guildId, {
        id: `log-fp-${Date.now()}`,
        guildId: guild.guildId,
        category: 'automod',
        actorId: ctx.actorUserId,
        actorName: ctx.actorUsername,
        targetId: report.id,
        targetName: channelName,
        summary: `Submitted AutoMod false-positive report in #${channelName}: ${notes}`,
        details: { reportId: report.id },
        createdAt: now,
      });
      return {
        ok: true,
        title: 'False-Positive Report Submitted',
        message: `Report ${report.id} logged for Shadow Council AutoMod tuning.`,
        data: { report },
      };
    }

    case 'warn':
    case 'timeout':
    case 'untimeout':
    case 'kick':
    case 'ban':
    case 'tempban':
    case 'unban':
    case 'purge':
    case 'slowmode':
    case 'lock':
    case 'unlock': {
      const action = normalized as ModerationActionType;
      if (DESTRUCTIVE_MOD_ACTIONS.has(action) && ctx.args.confirmed === false) {
        return {
          ok: false,
          title: 'Moderation Confirmation Required',
          message: `Action "/${action}" requires explicit confirmation (confirmed: true) before execution.`,
        };
      }
      const targetName = String(ctx.args.member || ctx.args.userId || ctx.args.channel || 'target');
      const reason = String(ctx.args.reason || 'Moderator action');
      const targetMember = guild.members.find(
        (m) => m.username.toLowerCase() === targetName.toLowerCase() || m.userId === targetName,
      );
      if (targetMember && !canActOnTargetRank(ctx.actorRank, targetMember.clanRank)) {
        return {
          ok: false,
          title: 'Hierarchy Protected',
          message: formatLocalizedString(bundle, fallback, 'commands.hierarchy_blocked'),
        };
      }
      return createModerationCase(
        guild,
        ctx,
        action,
        targetMember?.userId ?? targetName,
        targetMember?.username ?? targetName,
        reason,
      );
    }

    case 'warnings': {
      const target = String(ctx.args.member || '').toLowerCase();
      const list = guild.warnings.filter((w) => !target || w.username.toLowerCase() === target || w.userId === target);
      return {
        ok: true,
        title: 'Warning History',
        message: list.length === 0 ? 'No warnings found.' : list.map((w) => `${w.caseId}: ${w.username} — ${w.reason}`).join(' | '),
      };
    }

    case 'modlog':
      return {
        ok: true,
        title: 'Recent Moderation Cases',
        message: guild.moderationCases.slice(0, 5).map((c) => `${c.caseId} [${c.action}] ${c.targetUsername}: ${c.reason}`).join(' | '),
      };

    case 'case': {
      const cid = String(ctx.args.caseId || '').toUpperCase();
      const found = guild.moderationCases.find((c) => c.caseId === cid);
      return found
        ? { ok: true, title: found.caseId, message: `${found.action} on ${found.targetUsername} by ${found.moderatorUsername} — ${found.reason}` }
        : { ok: false, title: 'Case Not Found', message: `No moderation case matching "${cid}".` };
    }

    case 'appeal': {
      const cid = String(ctx.args.caseId || 'CASE-0001').toUpperCase();
      const reason = String(ctx.args.reason || 'Requesting review of moderation action.');
      guild.appeals.unshift({
        id: `appeal-${Date.now()}`,
        caseId: cid,
        userId: ctx.actorUserId,
        username: ctx.actorUsername,
        reason,
        status: 'pending',
        reviewerUsername: null,
        reviewNotes: null,
        createdAt: now,
        reviewedAt: null,
      });
      await ctx.db.saveGuild(guild);
      return { ok: true, title: 'Appeal Submitted', message: `Appeal for ${cid} queued for Shadow Council review.` };
    }

    case 'suggest': {
      const title = String(ctx.args.title || 'Community Proposal');
      const description = String(ctx.args.description || 'Submitted via /suggest');
      guild.suggestions.unshift({
        id: `sug-${Date.now()}`,
        authorId: ctx.actorUserId,
        authorName: ctx.actorUsername,
        title,
        description,
        status: 'open',
        upvotes: [ctx.actorUserId],
        downvotes: [],
        createdAt: now,
      });
      await ctx.db.saveGuild(guild);
      return { ok: true, title: 'Suggestion Recorded', message: `"${title}" added for community voting.` };
    }

    case 'poll': {
      const question = String(ctx.args.question || 'Clan Decision Poll');
      const opts = String(ctx.args.options || 'Yes, No')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
      guild.polls.unshift({
        id: `poll-${Date.now()}`,
        question,
        authorName: ctx.actorUsername,
        options: opts.map((label, idx) => ({ id: `opt-${idx + 1}`, label, voterIds: [] })),
        closed: false,
        endsAt: new Date(Date.now() + 86400_000).toISOString(),
        createdAt: now,
      });
      await ctx.db.saveGuild(guild);
      return { ok: true, title: 'Poll Created', message: `Poll "${question}" opened with ${opts.length} options.` };
    }

    case 'giveaway': {
      const prize = String(ctx.args.prize || 'Clan Reward Bundle');
      const minutes = Math.max(1, Number(ctx.args.minutes || 60));
      const endsAt = new Date(Date.now() + minutes * 60_000).toISOString();
      const gwId = `giveaway-${Date.now()}`;
      guild.giveaways.unshift({
        id: gwId,
        prize,
        hostName: ctx.actorUsername,
        winnerCount: 1,
        entrants: [],
        winnerIds: [],
        status: 'active',
        endsAt,
        createdAt: now,
      });
      guild.scheduledTasks.push({
        id: `task-${gwId}`,
        guildId: guild.guildId,
        type: 'giveaway_draw',
        targetId: gwId,
        description: `Draw winner for ${prize}`,
        runAt: endsAt,
        status: 'pending',
        attempts: 0,
        lastError: null,
        completedAt: null,
        createdAt: now,
      });
      await ctx.db.saveGuild(guild);
      return { ok: true, title: 'Giveaway Started', message: `Giveaway for "${prize}" scheduled to draw at ${endsAt}.` };
    }

    case 'event': {
      const title = String(ctx.args.title || 'Elemental Raid Assembly');
      guild.events.unshift({
        id: `event-${Date.now()}`,
        title,
        description: 'Scheduled via /event command.',
        eventType: 'raid',
        gameId: guild.games[0]?.id || 'game-loe',
        hostName: ctx.actorUsername,
        startsAt: new Date(Date.now() + 86400_000).toISOString(),
        maxParticipants: 10,
        rsvps: [{ userId: ctx.actorUserId, username: ctx.actorUsername, status: 'going', roleClass: null }],
        createdAt: now,
      });
      await ctx.db.saveGuild(guild);
      return { ok: true, title: 'Event Scheduled', message: `Event "${title}" created.` };
    }

    case 'remind': {
      const minutes = Math.max(1, Number(ctx.args.minutes || 30));
      const message = String(ctx.args.message || 'Reminder check-in');
      const runAt = new Date(Date.now() + minutes * 60_000).toISOString();
      const remId = `rem-${Date.now()}`;
      guild.reminders.unshift({
        id: remId,
        userId: ctx.actorUserId,
        username: ctx.actorUsername,
        channelName: ctx.channelName,
        message,
        remindAt: runAt,
        completed: false,
        createdAt: now,
      });
      guild.scheduledTasks.push({
        id: `task-${remId}`,
        guildId: guild.guildId,
        type: 'reminder',
        targetId: remId,
        description: `Reminder for ${ctx.actorUsername}: ${message}`,
        runAt,
        status: 'pending',
        attempts: 0,
        lastError: null,
        completedAt: null,
        createdAt: now,
      });
      await ctx.db.saveGuild(guild);
      return { ok: true, title: 'Reminder Scheduled', message: `Persistent reminder saved for ${minutes} minute(s) from now.` };
    }

    case 'recruitment':
      return {
        ok: true,
        title: 'Open Recruitment Forms',
        message: guild.recruitmentForms.filter((f) => f.enabled).map((f) => `${f.title} (${f.category})`).join(' | '),
      };

    case 'apply': {
      const summary = String(ctx.args.summary || 'Application submitted via /apply');
      guild.recruitmentApplications.unshift({
        id: `app-${Date.now()}`,
        formId: guild.recruitmentForms[0]?.id || 'form-clan',
        category: 'clan',
        applicantUserId: ctx.actorUserId,
        applicantUsername: ctx.actorUsername,
        answers: { summary },
        status: 'pending',
        reviewerUserId: null,
        reviewerUsername: null,
        reviewNotes: null,
        createdAt: now,
        reviewedAt: null,
      });
      await ctx.db.saveGuild(guild);
      return { ok: true, title: 'Application Submitted', message: formatLocalizedString(bundle, fallback, 'recruitment.submitted') };
    }

    case 'applications': {
      const pending = guild.recruitmentApplications.filter((a) => a.status === 'pending');
      return {
        ok: true,
        title: 'Recruitment Queue',
        message: `${pending.length} pending application(s): ${pending.map((a) => `${a.applicantUsername} (${a.category})`).join(', ') || 'None'}`,
      };
    }

    case 'ticket': {
      guild.ticketSequence += 1;
      const num = guild.ticketSequence;
      const subject = String(ctx.args.subject || 'General Council Support Request');
      guild.tickets.unshift({
        id: `ticket-${num}`,
        ticketNumber: num,
        category: 'general_support',
        subject,
        creatorUserId: ctx.actorUserId,
        creatorUsername: ctx.actorUsername,
        status: 'open',
        claimedByUserId: null,
        claimedByUsername: null,
        channelName: `ticket-${String(num).padStart(4, '0')}`,
        feedbackRating: null,
        feedbackComment: null,
        messages: [
          {
            id: `tm-${Date.now()}`,
            authorId: ctx.actorUserId,
            authorName: ctx.actorUsername,
            authorRole: ctx.actorRank,
            content: subject,
            createdAt: now,
          },
        ],
        createdAt: now,
        closedAt: null,
      });
      await ctx.db.saveGuild(guild);
      return {
        ok: true,
        title: `Ticket #${num} Created`,
        message: formatLocalizedString(bundle, fallback, 'tickets.created', { ticketNumber: num }),
      };
    }

    case 'clan':
      return {
        ok: true,
        title: 'ShadowSlayers Clan Overview',
        message: `${guild.teams.length} active squad(s) · ${guild.raidSchedules.length} scheduled raid(s) · ${guild.gamingClasses.length} elemental classes`,
      };

    case 'members': {
      const q = String(ctx.args.query || '').toLowerCase();
      const matched = guild.members.filter(
        (m) => !m.isDeparted && (!q || m.username.toLowerCase().includes(q) || m.clanRank.toLowerCase().includes(q)),
      );
      return {
        ok: true,
        title: `Clan Directory (${matched.length})`,
        message: matched.slice(0, 6).map((m) => `${m.username} [${m.clanRank}]`).join(' · '),
      };
    }

    case 'leaderboard': {
      const top = [...guild.members].filter((m) => !m.isDeparted).sort((a, b) => b.xp - a.xp).slice(0, 5);
      return {
        ok: true,
        title: 'ShadowSlayers XP Leaderboard',
        message: top.map((m, idx) => `#${idx + 1} ${m.username} (Lv.${m.level}, ${m.xp} XP)`).join(' | '),
      };
    }

    case 'achievements':
      return {
        ok: true,
        title: 'Clan Achievements',
        message: guild.achievements.map((a) => `${a.name}: ${a.description}`).join(' | '),
      };

    case 'activity': {
      const cutoff = Date.now() - guild.progression.inactivityThresholdDays * 86400_000;
      const inactive = guild.members.filter((m) => !m.isDeparted && new Date(m.lastActiveAt).getTime() < cutoff);
      return {
        ok: true,
        title: 'Clan Activity Report',
        message: `${guild.members.filter((m) => !m.isDeparted).length} active members tracked · ${inactive.length} exceeding ${guild.progression.inactivityThresholdDays}d inactivity threshold.`,
      };
    }

    default:
      return { ok: true, title: `/${normalized}`, message: 'Command executed cleanly.' };
  }
}

async function createModerationCase(
  guild: GuildState,
  ctx: CommandExecutionContext,
  action: GuildState['moderationCases'][0]['action'],
  targetUserId: string,
  targetUsername: string,
  reason: string,
): Promise<CommandExecutionResult> {
  const now = new Date().toISOString();
  const durationMinutes =
    action === 'timeout' || action === 'tempban' || action === 'purge' || action === 'slowmode'
      ? Math.max(1, Number(ctx.args.minutes || ctx.args.count || ctx.args.seconds || 60))
      : null;
  const expiresAt =
    (action === 'timeout' || action === 'tempban') && durationMinutes
      ? new Date(Date.now() + durationMinutes * 60_000).toISOString()
      : null;

  let discordExecutionStatus: 'verified_live' | 'dry_run_no_bot' | 'failed' = 'dry_run_no_bot';
  let discordError: string | null = null;

  if (ctx.discordExecutor?.executeModeration) {
    const execRes = await ctx.discordExecutor.executeModeration({
      action,
      targetUserId,
      reason,
      durationMinutes,
      channelName: ctx.channelName,
    });
    if (execRes.ok) {
      discordExecutionStatus = 'verified_live';
    } else {
      discordExecutionStatus = 'failed';
      discordError = execRes.error || 'Discord API rejected moderation operation.';
    }
  }

  guild.caseSequence += 1;
  const caseId = `CASE-${String(guild.caseSequence).padStart(4, '0')}`;

  guild.moderationCases.unshift({
    caseId,
    sequence: guild.caseSequence,
    guildId: guild.guildId,
    action,
    targetUserId,
    targetUsername,
    moderatorUserId: ctx.actorUserId,
    moderatorUsername: ctx.actorUsername,
    reason,
    durationMinutes,
    expiresAt,
    active: discordExecutionStatus !== 'failed' && action !== 'untimeout' && action !== 'unban' && action !== 'unlock',
    channelName: ctx.channelName,
    discordExecutionStatus,
    discordError,
    createdAt: now,
  });

  if (discordExecutionStatus !== 'failed') {
    if (action === 'warn') {
      guild.warnings.unshift({
        id: `warn-${Date.now()}`,
        caseId,
        userId: targetUserId,
        username: targetUsername,
        moderatorUsername: ctx.actorUsername,
        reason,
        active: true,
        createdAt: now,
      });
    }

    if (action === 'tempban' && expiresAt) {
      guild.scheduledTasks.push({
        id: `task-tempban-${caseId}`,
        guildId: guild.guildId,
        type: 'tempban_expiry',
        targetId: caseId,
        description: `Expire tempban ${caseId} for ${targetUsername}`,
        runAt: expiresAt,
        status: 'pending',
        attempts: 0,
        lastError: null,
        completedAt: null,
        createdAt: now,
      });
    }
  }

  await ctx.db.saveGuild(guild);
  await ctx.db.appendAuditLog(guild.guildId, {
    id: `log-mod-${Date.now()}`,
    guildId: guild.guildId,
    category: 'moderation',
    actorId: ctx.actorUserId,
    actorName: ctx.actorUsername,
    targetId: targetUserId,
    targetName: targetUsername,
    summary:
      discordExecutionStatus === 'failed'
        ? `Failed ${action} (${caseId}) against ${targetUsername}: ${discordError}`
        : `Executed ${action} (${caseId}, ${discordExecutionStatus}) against ${targetUsername}: ${reason}`,
    details: { caseId, action, durationMinutes, discordExecutionStatus, discordError },
    createdAt: now,
  });

  if (discordExecutionStatus === 'failed') {
    return {
      ok: false,
      title: `${caseId} Discord Execution Failed`,
      message: `Discord rejected "${action}" against ${targetUsername}: ${discordError}`,
      data: { caseId, discordExecutionStatus, discordError },
    };
  }

  return {
    ok: true,
    title: `${caseId} Recorded`,
    message:
      discordExecutionStatus === 'verified_live'
        ? `Action "${action}" executed live on Discord and logged against ${targetUsername}.`
        : `Action "${action}" logged in standby mode (live Discord Gateway offline) against ${targetUsername}.`,
    data: { caseId, discordExecutionStatus },
  };
}
