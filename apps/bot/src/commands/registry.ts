import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
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

export type CommandOptionType = 'string' | 'integer' | 'user' | 'channel' | 'boolean';

export interface CommandOptionChoice {
  name: string;
  value: string;
}

export interface CommandOptionSpec {
  name: string;
  type: CommandOptionType;
  description: string;
  required: boolean;
  minValue?: number;
  maxValue?: number;
  choices?: CommandOptionChoice[];
}

export interface CommandDescriptor {
  name: string;
  category: CommandCategory;
  description: string;
  requiredCapability: PermissionCapability;
  optionsSummary: string[];
  options: CommandOptionSpec[];
}

export interface DiscordCommandExecutor {
  executeModeration?: (params: {
    action: ModerationActionType;
    targetUserId: string;
    reason: string;
    durationMinutes: number | null;
    channelName: string;
    deleteMessageSeconds?: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  publishRolePanel?: (panel: RolePanel) => Promise<{ ok: boolean; messageId?: string; error?: string }>;
  publishRulesMessage?: (params: {
    channelName: string;
    title: string;
    body: string;
    reactionEmoji: string;
  }) => Promise<{ ok: boolean; messageId?: string; error?: string }>;
  grantDiscordRole?: (params: {
    userId: string;
    roleName: string;
    reason: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  removeDiscordRole?: (params: {
    userId: string;
    roleName: string;
    reason: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  getLiveMemberRoleNames?: (userId: string) => Promise<string[] | null>;
  getBotRuntimeSummary?: () => {
    connected: boolean;
    mode: string;
    botTag: string | null;
    guildCount: number;
  };
}

export interface CommandExecutionContext {
  guildId: string;
  actorUserId: string;
  actorUsername: string;
  actorRank: ClanRankName | null;
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

function opt(
  name: string,
  type: CommandOptionType,
  description: string,
  required = false,
  extra?: Pick<CommandOptionSpec, 'minValue' | 'maxValue' | 'choices'>,
): CommandOptionSpec {
  return { name, type, description, required, ...extra };
}

function formatOptionsSummary(options: CommandOptionSpec[]): string[] {
  return options.map((o) => (o.required ? o.name : `${o.name}?`));
}

interface RawCommandDef {
  name: string;
  category: CommandCategory;
  description: string;
  requiredCapability: PermissionCapability;
  options: CommandOptionSpec[];
}

const RAW_SLASH_COMMANDS: RawCommandDef[] = [
  // General
  {
    name: 'help',
    category: 'General',
    description: 'List categorized ShadowSlayers commands',
    requiredCapability: 'overview.view',
    options: [opt('category', 'string', 'Filter commands by category', false)],
  },
  {
    name: 'about',
    category: 'General',
    description: 'Show platform architecture and realm details',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'bot-status',
    category: 'General',
    description: 'Check bot gateway, database, and module operational status',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'profile',
    category: 'General',
    description: 'Inspect member XP, level, clan rank, and languages',
    requiredCapability: 'overview.view',
    options: [opt('member', 'user', 'Target member to inspect', false)],
  },
  {
    name: 'userinfo',
    category: 'General',
    description: 'Inspect member roles, verification, and onboarding state',
    requiredCapability: 'overview.view',
    options: [opt('member', 'user', 'Target member to inspect', false)],
  },
  {
    name: 'avatar',
    category: 'General',
    description: 'Display member avatar URL and identity badge',
    requiredCapability: 'overview.view',
    options: [opt('member', 'user', 'Member whose avatar to display', false)],
  },
  {
    name: 'server',
    category: 'General',
    description: 'Display discovered server categories and role summary',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'serverinfo',
    category: 'General',
    description: 'Show detailed ShadowSlayers server structure and member counts',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'language',
    category: 'General',
    description: 'Toggle or view your independent language roles',
    requiredCapability: 'overview.view',
    options: [opt('code', 'string', 'Language code to select (e.g. en, ru)', false)],
  },
  {
    name: 'onboarding status',
    category: 'General',
    description: 'Inspect 5-step onboarding status for yourself or another member',
    requiredCapability: 'overview.view',
    options: [opt('member', 'user', 'Member to inspect (leadership only for others)', false)],
  },
  {
    name: 'onboarding active_player',
    category: 'General',
    description: 'Claim 🌱 Recruit after completing Steps 1–3 of onboarding',
    requiredCapability: 'overview.view',
    options: [opt('member', 'user', 'Target member (leadership only for others)', false)],
  },
  {
    name: 'modules',
    category: 'General',
    description: 'List enabled and disabled bot modules',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'dashboard',
    category: 'General',
    description: 'Get the administration dashboard link',
    requiredCapability: 'overview.view',
    options: [],
  },

  // Setup & Administration
  {
    name: 'setup',
    category: 'Setup & Administration',
    description: 'Run non-destructive server discovery & diff preview',
    requiredCapability: 'discovery.apply',
    options: [opt('confirm', 'boolean', 'Confirm preview inspection mode', false)],
  },
  {
    name: 'config',
    category: 'Setup & Administration',
    description: 'View or toggle core guild module settings',
    requiredCapability: 'settings.manage',
    options: [
      opt('module', 'string', 'Guild module name', false),
      opt('enabled', 'boolean', 'Enable or disable the selected module', false),
    ],
  },
  {
    name: 'permissions matrix',
    category: 'Setup & Administration',
    description: 'Inspect clan rank hierarchy and capabilities',
    requiredCapability: 'discovery.view',
    options: [],
  },
  {
    name: 'permissions preview',
    category: 'Setup & Administration',
    description: 'Preview permission audit differences, read-only guards, and Inner Sanctum isolation',
    requiredCapability: 'discovery.view',
    options: [],
  },
  {
    name: 'rules publish',
    category: 'Setup & Administration',
    description: 'Publish localized rules embed & ✅ reaction gate to 📜・rules',
    requiredCapability: 'roles.publish',
    options: [opt('channel', 'channel', 'Target rules channel (defaults to 📜・rules)', false)],
  },
  {
    name: 'custom-response',
    category: 'Setup & Administration',
    description: 'List, add, or remove deterministic keyword custom responses',
    requiredCapability: 'community.manage',
    options: [
      opt('action', 'string', 'Action to run (list, add, remove)', true, {
        choices: [
          { name: 'list', value: 'list' },
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' },
        ],
      }),
      opt('trigger', 'string', 'Trigger keyword or phrase', false),
      opt('response', 'string', 'Deterministic reply message', false),
      opt('match_mode', 'string', 'How trigger matches incoming messages', false, {
        choices: [
          { name: 'contains', value: 'contains' },
          { name: 'exact', value: 'exact' },
          { name: 'startsWith', value: 'startsWith' },
        ],
      }),
    ],
  },

  // Roles
  {
    name: 'roles list',
    category: 'Roles',
    description: 'List configured role panels and role groups',
    requiredCapability: 'roles.view',
    options: [],
  },
  {
    name: 'roles publish',
    category: 'Roles',
    description: 'Publish a configured role-selection panel only (never server setup)',
    requiredCapability: 'roles.publish',
    options: [opt('panel_id', 'string', 'Configured role panel ID to publish', true)],
  },

  // AutoMod
  {
    name: 'automod status',
    category: 'AutoMod',
    description: 'Display deterministic AutoMod rules, lockdown, and false-positive queue',
    requiredCapability: 'moderation.view',
    options: [],
  },
  {
    name: 'automod test',
    category: 'AutoMod',
    description: 'Test a sample message against deterministic AutoMod rules',
    requiredCapability: 'automod.manage',
    options: [
      opt('message', 'string', 'Sample message content to evaluate', true),
      opt('channel', 'channel', 'Target channel context', false),
      opt('mentions', 'integer', 'Simulated mention count (0–50)', false, { minValue: 0, maxValue: 50 }),
    ],
  },
  {
    name: 'false-positive',
    category: 'AutoMod',
    description: 'Report an AutoMod false-positive match for moderator review',
    requiredCapability: 'overview.view',
    options: [
      opt('message_id', 'string', 'ID of the flagged Discord message', true),
      opt('reason', 'string', 'Why this trigger was a false positive', true),
      opt('channel', 'channel', 'Channel where the message was posted', false),
      opt('content', 'string', 'Optional excerpt of the flagged message', false),
    ],
  },

  // Moderation
  {
    name: 'warn',
    category: 'Moderation',
    description: 'Issue a warning and create a moderation case',
    requiredCapability: 'moderation.execute',
    options: [
      opt('member', 'user', 'Member to warn', true),
      opt('reason', 'string', 'Reason for warning', true),
    ],
  },
  {
    name: 'warnings',
    category: 'Moderation',
    description: 'List warnings for a target member',
    requiredCapability: 'moderation.view',
    options: [opt('member', 'user', 'Member whose warnings to inspect', true)],
  },
  {
    name: 'timeout',
    category: 'Moderation',
    description: 'Timeout a member for N minutes',
    requiredCapability: 'moderation.execute',
    options: [
      opt('member', 'user', 'Member to time out', true),
      opt('duration', 'integer', 'Timeout duration in minutes (1–40320)', true, { minValue: 1, maxValue: 40320 }),
      opt('reason', 'string', 'Reason for timeout', true),
    ],
  },
  {
    name: 'untimeout',
    category: 'Moderation',
    description: 'Remove an active timeout',
    requiredCapability: 'moderation.execute',
    options: [
      opt('member', 'user', 'Member whose timeout to remove', true),
      opt('reason', 'string', 'Reason for removing timeout', false),
    ],
  },
  {
    name: 'kick',
    category: 'Moderation',
    description: 'Kick a member with logged reason and confirmation check',
    requiredCapability: 'moderation.execute',
    options: [
      opt('member', 'user', 'Member to kick', true),
      opt('reason', 'string', 'Reason for kick', true),
      opt('confirmed', 'boolean', 'Confirm kick action', false),
    ],
  },
  {
    name: 'ban',
    category: 'Moderation',
    description: 'Permanently ban a member with logged case and confirmation check',
    requiredCapability: 'moderation.execute',
    options: [
      opt('member', 'user', 'Member to ban', true),
      opt('reason', 'string', 'Reason for ban', true),
      opt('delete_message_days', 'integer', 'Recent message history days to prune (0–7)', false, { minValue: 0, maxValue: 7 }),
      opt('confirmed', 'boolean', 'Confirm permanent ban action', false),
    ],
  },
  {
    name: 'tempban',
    category: 'Moderation',
    description: 'Temporarily ban a member and schedule unban',
    requiredCapability: 'moderation.execute',
    options: [
      opt('member', 'user', 'Member to temporarily ban', true),
      opt('duration', 'integer', 'Ban duration in minutes (1–525600)', true, { minValue: 1, maxValue: 525600 }),
      opt('reason', 'string', 'Reason for temporary ban', true),
    ],
  },
  {
    name: 'unban',
    category: 'Moderation',
    description: 'Revoke a ban by user ID',
    requiredCapability: 'moderation.execute',
    options: [
      opt('user_id', 'string', 'Discord user ID to unban', true),
      opt('reason', 'string', 'Reason for unban', true),
    ],
  },
  {
    name: 'purge',
    category: 'Moderation',
    description: 'Bulk remove messages with audit record and confirmation check',
    requiredCapability: 'moderation.execute',
    options: [
      opt('amount', 'integer', 'Number of messages to delete (1–100)', true, { minValue: 1, maxValue: 100 }),
      opt('channel', 'channel', 'Target channel (defaults to current)', false),
      opt('confirmed', 'boolean', 'Confirm bulk message deletion', false),
    ],
  },
  {
    name: 'slowmode',
    category: 'Moderation',
    description: 'Set channel slowmode seconds',
    requiredCapability: 'moderation.execute',
    options: [
      opt('seconds', 'integer', 'Slowmode delay in seconds (0–21600)', true, { minValue: 0, maxValue: 21600 }),
      opt('channel', 'channel', 'Target channel (defaults to current)', false),
    ],
  },
  {
    name: 'lock',
    category: 'Moderation',
    description: 'Lock a channel against regular member messages',
    requiredCapability: 'moderation.execute',
    options: [
      opt('channel', 'channel', 'Channel to lock', true),
      opt('reason', 'string', 'Reason for locking channel', true),
    ],
  },
  {
    name: 'unlock',
    category: 'Moderation',
    description: 'Unlock a previously locked channel',
    requiredCapability: 'moderation.execute',
    options: [
      opt('channel', 'channel', 'Channel to unlock', true),
      opt('reason', 'string', 'Reason for unlocking channel', true),
    ],
  },
  {
    name: 'modlog',
    category: 'Moderation',
    description: 'Display recent moderation cases',
    requiredCapability: 'moderation.view',
    options: [opt('limit', 'integer', 'Number of recent cases to show (1–25)', false, { minValue: 1, maxValue: 25 })],
  },
  {
    name: 'case',
    category: 'Moderation',
    description: 'View details for a specific moderation case ID',
    requiredCapability: 'moderation.view',
    options: [opt('case_id', 'string', 'Moderation case ID (e.g. CASE-0001)', true)],
  },
  {
    name: 'appeal',
    category: 'Moderation',
    description: 'Submit an appeal for an existing moderation case',
    requiredCapability: 'overview.view',
    options: [
      opt('case_id', 'string', 'Moderation case ID to appeal', true),
      opt('reason', 'string', 'Reason for appeal', true),
    ],
  },

  // Community
  {
    name: 'suggest',
    category: 'Community',
    description: 'Submit a community suggestion for voting',
    requiredCapability: 'overview.view',
    options: [
      opt('title', 'string', 'Suggestion title', true),
      opt('description', 'string', 'Detailed proposal', true),
    ],
  },
  {
    name: 'poll',
    category: 'Community',
    description: 'Create a community poll',
    requiredCapability: 'community.manage',
    options: [
      opt('question', 'string', 'Poll question', true),
      opt('options', 'string', 'Comma-separated choices (2–6)', true),
    ],
  },
  {
    name: 'giveaway',
    category: 'Community',
    description: 'Start a timed giveaway with scheduled draw',
    requiredCapability: 'community.manage',
    options: [
      opt('prize', 'string', 'Giveaway prize', true),
      opt('minutes', 'integer', 'Duration in minutes (1–43200)', true, { minValue: 1, maxValue: 43200 }),
    ],
  },
  {
    name: 'event',
    category: 'Community',
    description: 'Create a scheduled community or raid event',
    requiredCapability: 'community.manage',
    options: [
      opt('title', 'string', 'Event title', true),
      opt('type', 'string', 'Event category', false, {
        choices: [
          { name: 'raid', value: 'raid' },
          { name: 'dungeon', value: 'dungeon' },
          { name: 'community', value: 'community' },
          { name: 'tournament', value: 'tournament' },
        ],
      }),
    ],
  },
  {
    name: 'remind',
    category: 'Community',
    description: 'Create a persistent reminder task',
    requiredCapability: 'overview.view',
    options: [
      opt('minutes', 'integer', 'Minutes until reminder (1–525600)', true, { minValue: 1, maxValue: 525600 }),
      opt('message', 'string', 'Reminder message text', true),
    ],
  },

  // Recruitment
  {
    name: 'recruitment',
    category: 'Recruitment',
    description: 'List open clan, staff, and event recruitment forms',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'apply',
    category: 'Recruitment',
    description: 'Submit a recruitment application',
    requiredCapability: 'overview.view',
    options: [
      opt('category', 'string', 'Application category', true, {
        choices: [
          { name: 'clan', value: 'clan' },
          { name: 'staff', value: 'staff' },
        ],
      }),
      opt('summary', 'string', 'Application summary and experience', true),
    ],
  },
  {
    name: 'applications',
    category: 'Recruitment',
    description: 'Inspect pending recruitment applications',
    requiredCapability: 'recruitment.view',
    options: [],
  },

  // Support
  {
    name: 'ticket',
    category: 'Support',
    description: 'Open a support ticket',
    requiredCapability: 'overview.view',
    options: [opt('subject', 'string', 'Short summary of your support request', true)],
  },

  // Clan
  {
    name: 'clan',
    category: 'Clan',
    description: 'Overview of ShadowSlayers teams and scheduled raids',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'members',
    category: 'Clan',
    description: 'Search clan members by rank or language',
    requiredCapability: 'members.view',
    options: [opt('query', 'string', 'Search username or clan rank', false)],
  },
  {
    name: 'leaderboard',
    category: 'Clan',
    description: 'View top members by XP and level',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'achievements',
    category: 'Clan',
    description: 'List clan achievements and unlock criteria',
    requiredCapability: 'overview.view',
    options: [],
  },
  {
    name: 'activity',
    category: 'Clan',
    description: 'Review active and inactive member thresholds',
    requiredCapability: 'members.view',
    options: [],
  },
];

export const SLASH_COMMANDS: CommandDescriptor[] = RAW_SLASH_COMMANDS.map((cmd) => ({
  ...cmd,
  optionsSummary: formatOptionsSummary(cmd.options),
}));

function attachOption(
  target: SlashCommandBuilder | SlashCommandSubcommandBuilder,
  spec: CommandOptionSpec,
): void {
  const desc = spec.description.slice(0, 100);
  if (spec.type === 'string') {
    target.addStringOption((o) => {
      o.setName(spec.name).setDescription(desc).setRequired(spec.required);
      if (spec.choices && spec.choices.length > 0) {
        o.addChoices(...spec.choices);
      }
      return o;
    });
    return;
  }
  if (spec.type === 'integer') {
    target.addIntegerOption((o) => {
      o.setName(spec.name).setDescription(desc).setRequired(spec.required);
      if (typeof spec.minValue === 'number') o.setMinValue(spec.minValue);
      if (typeof spec.maxValue === 'number') o.setMaxValue(spec.maxValue);
      return o;
    });
    return;
  }
  if (spec.type === 'user') {
    target.addUserOption((o) => o.setName(spec.name).setDescription(desc).setRequired(spec.required));
    return;
  }
  if (spec.type === 'channel') {
    target.addChannelOption((o) => o.setName(spec.name).setDescription(desc).setRequired(spec.required));
    return;
  }
  if (spec.type === 'boolean') {
    target.addBooleanOption((o) => o.setName(spec.name).setDescription(desc).setRequired(spec.required));
  }
}

function resolveDefaultPermissionsForRoot(commands: CommandDescriptor[]): string | null {
  const caps = new Set(commands.map((c) => c.requiredCapability));
  if (caps.has('discovery.apply') || caps.has('settings.manage')) {
    return PermissionFlagsBits.ManageGuild.toString();
  }
  if (caps.has('moderation.execute')) {
    return PermissionFlagsBits.ModerateMembers.toString();
  }
  if (caps.has('roles.publish') || caps.has('automod.manage')) {
    return PermissionFlagsBits.ManageRoles.toString();
  }
  return null;
}

const ROOT_DESCRIPTIONS: Record<string, string> = {
  onboarding: 'View 5-step onboarding status or claim active-player 🌱 Recruit rank',
  permissions: 'Inspect ShadowSlayers clan rank hierarchy and permission audit diffs',
  rules: 'Publish localized rules verification gates',
  roles: 'List or publish configured role-selection panels',
  automod: 'Inspect deterministic AutoMod status or test sample messages',
};

export function buildDiscordSlashCommandsJson() {
  const grouped = new Map<string, CommandDescriptor[]>();
  for (const cmd of SLASH_COMMANDS) {
    const [root] = cmd.name.split(' ');
    const list = grouped.get(root) ?? [];
    list.push(cmd);
    grouped.set(root, list);
  }

  const builders: SlashCommandBuilder[] = [];
  for (const [root, cmds] of grouped.entries()) {
    const hasSubcommands = cmds.some((c) => c.name.includes(' '));
    const builder = new SlashCommandBuilder()
      .setName(root)
      .setDescription((ROOT_DESCRIPTIONS[root] ?? cmds[0].description).slice(0, 100));

    const defaultPerm = resolveDefaultPermissionsForRoot(cmds);
    if (defaultPerm) {
      builder.setDefaultMemberPermissions(BigInt(defaultPerm));
    }

    if (hasSubcommands) {
      for (const cmd of cmds) {
        const [, sub] = cmd.name.split(' ');
        if (!sub) {
          throw new Error(
            `Invalid slash command definition: "${cmd.name}" mixes top-level invocation with subcommands under "${root}".`,
          );
        }
        builder.addSubcommand((sc) => {
          sc.setName(sub).setDescription(cmd.description.slice(0, 100));
          // Enforce required options before optional options per Discord API specification
          const ordered = [...cmd.options].sort((a, b) => Number(b.required) - Number(a.required));
          for (const optSpec of ordered) {
            attachOption(sc, optSpec);
          }
          return sc;
        });
      }
    } else {
      const cmd = cmds[0];
      const ordered = [...cmd.options].sort((a, b) => Number(b.required) - Number(a.required));
      for (const optSpec of ordered) {
        attachOption(builder, optSpec);
      }
    }

    builders.push(builder);
  }

  return builders.map((b) => b.toJSON());
}

function getStringArg(args: Record<string, string | number | boolean>, ...keys: string[]): string {
  for (const key of keys) {
    const val = args[key];
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  }
  return '';
}

function getIntArg(args: Record<string, string | number | boolean>, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = args[key];
    if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
    if (typeof val === 'string' && val.trim().length > 0) {
      const n = Number(val.trim());
      if (Number.isFinite(n)) return Math.trunc(n);
    }
  }
  return null;
}

function getBoolArg(args: Record<string, string | number | boolean>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const val = args[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (lower === 'true' || lower === 'yes' || lower === '1') return true;
      if (lower === 'false' || lower === 'no' || lower === '0') return false;
    }
  }
  return undefined;
}

function findMember(guild: GuildState, ref: string) {
  const clean = ref.trim().replace(/^<@!?(\d+)>$/, '$1').toLowerCase();
  if (!clean) return undefined;
  return guild.members.find(
    (m) => m.userId.toLowerCase() === clean || m.username.toLowerCase() === clean,
  );
}

function normalizeChannelName(raw: string, fallbackChannel: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return fallbackChannel;
  return cleaned;
}

export function commandModule(command: Pick<CommandDescriptor, 'name' | 'category'>): keyof GuildState['modules'] | undefined {
  const root = command.name.split(' ')[0];
  if (root === 'setup' || root === 'permissions') return 'discovery';
  if (root === 'rules' || root === 'onboarding') return 'onboarding';
  if (root === 'custom-response') return 'community';
  switch (command.category) {
    case 'Roles': return 'roles';
    case 'AutoMod': return 'automod';
    case 'Moderation': return 'moderation';
    case 'Community': return 'community';
    case 'Recruitment': return 'recruitment';
    case 'Support': return 'tickets';
    case 'Clan': return 'clan';
    default: return undefined;
  }
}

export async function executeSlashCommand(
  commandName: string,
  ctx: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  let normalized = commandName.trim().toLowerCase().replace(/^\//, '').replace(/\s+/g, ' ');
  if (normalized === 'roles') normalized = 'roles list';
  if (normalized === 'permissions') normalized = 'permissions matrix';
  if (normalized === 'onboarding') {
    const subAction = getStringArg(ctx.args, 'action').toLowerCase();
    normalized = subAction === 'active_player' || subAction === 'claim_recruit' ? 'onboarding active_player' : 'onboarding status';
  }

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
  const module = commandModule(descriptor);
  if (module && !guild.modules[module]) {
    return { ok: false, title: 'Module Disabled', message: 'This module is disabled for this guild.' };
  }

  const bundle = guild.translations[ctx.locale] ?? guild.translations.en;
  const fallback = guild.translations.en;

  // Onboarding status/active_player on SELF is allowed for unranked verified members completing Step 5.
  // Every other command and targeting another member requires a clan rank with the required capability.
  const isSelfOnboarding =
    (normalized === 'onboarding status' || normalized === 'onboarding active_player') &&
    (!getStringArg(ctx.args, 'member', 'user_id') ||
      getStringArg(ctx.args, 'member', 'user_id').toLowerCase() === ctx.actorUserId.toLowerCase() ||
      getStringArg(ctx.args, 'member', 'user_id').toLowerCase() === ctx.actorUsername.toLowerCase());

  if (!isSelfOnboarding && !hasCapability(ctx.actorRank, descriptor.requiredCapability)) {
    return {
      ok: false,
      title: 'Permission Denied',
      message: formatLocalizedString(bundle, fallback, 'commands.no_permission'),
    };
  }

  if (
    (normalized === 'onboarding status' || normalized === 'onboarding active_player') &&
    !isSelfOnboarding &&
    !hasCapability(ctx.actorRank, normalized === 'onboarding active_player' ? 'members.edit' : 'members.view')
  ) {
    return {
      ok: false,
      title: 'Permission Denied',
      message: formatLocalizedString(bundle, fallback, 'commands.no_permission'),
    };
  }

  const now = new Date().toISOString();

  switch (normalized) {
    case 'help': {
      const catFilter = getStringArg(ctx.args, 'category').toLowerCase();
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
        title: 'ShadowSlayers Bot',
        message: 'Independent Discord community administration with multi-server support and configurable game catalogs.',
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
      const targetRef = getStringArg(ctx.args, 'member', 'user_id') || ctx.actorUserId;
      const member = findMember(guild, targetRef) ?? findMember(guild, ctx.actorUsername);
      if (!member) {
        return { ok: false, title: 'Member Not Found', message: `No member matching "${targetRef}" was found in this guild.` };
      }
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
      const targetRef = getStringArg(ctx.args, 'member', 'user_id') || ctx.actorUserId;
      const member = findMember(guild, targetRef) ?? findMember(guild, ctx.actorUsername);
      if (!member) {
        return { ok: false, title: 'Member Not Found', message: `No member matching "${targetRef}" was found.` };
      }
      return {
        ok: true,
        title: `Avatar for ${member.displayName}`,
        message: member.avatarUrl ? `Avatar URL: ${member.avatarUrl}` : `${member.username} is using their default Discord avatar.`,
        data: { avatarUrl: member.avatarUrl },
      };
    }

    case 'onboarding status':
    case 'onboarding active_player': {
      const targetRef = getStringArg(ctx.args, 'member', 'user_id') || ctx.actorUserId;
      const member = findMember(guild, targetRef) ?? findMember(guild, ctx.actorUsername);
      if (!member) {
        return {
          ok: false,
          title: 'Member Not Found',
          message: 'Member record not found. Complete Step 1 by reacting with ✅ in 📜・rules first.',
        };
      }

      const liveRoles = ctx.discordExecutor?.getLiveMemberRoleNames
        ? await ctx.discordExecutor.getLiveMemberRoleNames(member.userId)
        : null;

      if (normalized === 'onboarding active_player') {
        if (!ctx.discordExecutor?.grantDiscordRole) {
          await ctx.db.appendAuditLog(guild.guildId, {
            id: `log-onb-offline-${Date.now()}`,
            guildId: guild.guildId,
            category: 'role_change',
            actorId: ctx.actorUserId,
            actorName: ctx.actorUsername,
            targetId: member.userId,
            targetName: member.username,
            summary: `Rejected /onboarding active_player for ${member.username}: Discord Gateway offline (🌱 Recruit not assigned).`,
            details: { ok: false, reason: 'discord_gateway_offline' },
            createdAt: now,
          });
          return {
            ok: false,
            title: 'Discord Gateway Offline',
            message: 'Cannot grant 🌱 Recruit while the Discord Gateway is offline. No clan rank changes were saved.',
          };
        }

        // Validate eligibility on a deep-cloned candidate before committing any state
        const cloned = JSON.parse(JSON.stringify(guild)) as GuildState;
        const res = grantActivePlayerRecruit(cloned, {
          userId: member.userId,
          username: member.username,
          actualDiscordRoleNames: liveRoles,
          nowIso: now,
        });

        if (!res.ok) {
          return {
            ok: false,
            title: 'Onboarding Requirements Incomplete',
            message: res.reason,
            data: { status: res.status },
          };
        }

        if (res.grantedRole) {
          const roleRes = await ctx.discordExecutor.grantDiscordRole({
            userId: member.userId,
            roleName: res.grantedRole,
            reason: 'Step 5 active-player onboarding completion',
          });
          if (!roleRes.ok) {
            await ctx.db.appendAuditLog(guild.guildId, {
              id: `log-onb-fail-${Date.now()}`,
              guildId: guild.guildId,
              category: 'role_change',
              actorId: ctx.actorUserId,
              actorName: ctx.actorUsername,
              targetId: member.userId,
              targetName: member.username,
              summary: `Failed to assign ${res.grantedRole} on Discord for ${member.username}: ${roleRes.error || 'Discord error'}`,
              details: { ok: false, error: roleRes.error ?? null },
              createdAt: now,
            });
            return {
              ok: false,
              title: 'Discord Role Grant Failed',
              message: roleRes.error || 'Could not assign 🌱 Recruit role on Discord.',
            };
          }
        }

        await ctx.db.saveGuild(cloned);
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

        return {
          ok: true,
          title: 'Active-Player Onboarding Updated',
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
      const code = getStringArg(ctx.args, 'code').toLowerCase();
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
      if (!actorMember) {
        return { ok: false, title: 'Member Not Found', message: 'Your guild member profile is not initialized.' };
      }

      if (!ctx.discordExecutor?.grantDiscordRole) {
        return {
          ok: false,
          title: 'Discord Gateway Offline',
          message: `Cannot assign Discord role "${targetLang.roleName}" while Discord Gateway is offline.`,
        };
      }

      const alreadyHas = actorMember.languageCodes.includes(code);
      if (guild.onboarding.allowMultipleLanguages && alreadyHas) {
        if (!ctx.discordExecutor.removeDiscordRole) {
          return { ok: false, title: 'Discord Action Unavailable', message: 'Role removal is unavailable on Discord executor.' };
        }
        const remRes = await ctx.discordExecutor.removeDiscordRole({
          userId: actorMember.userId,
          roleName: targetLang.roleName,
          reason: '/language toggle off',
        });
        if (!remRes.ok) {
          return { ok: false, title: 'Discord Role Update Failed', message: remRes.error || 'Failed to remove language role on Discord.' };
        }
        actorMember.languageCodes = actorMember.languageCodes.filter((c) => c !== code);
      } else {
        if (!guild.onboarding.allowMultipleLanguages && ctx.discordExecutor.removeDiscordRole) {
          for (const prevCode of actorMember.languageCodes) {
            if (prevCode === code) continue;
            const prevLang = guild.languages.find((l) => l.code === prevCode);
            if (prevLang) {
              await ctx.discordExecutor.removeDiscordRole({
                userId: actorMember.userId,
                roleName: prevLang.roleName,
                reason: 'Exclusive language switch via /language',
              });
            }
          }
        }
        const grantRes = await ctx.discordExecutor.grantDiscordRole({
          userId: actorMember.userId,
          roleName: targetLang.roleName,
          reason: '/language selection',
        });
        if (!grantRes.ok) {
          return { ok: false, title: 'Discord Role Update Failed', message: grantRes.error || 'Failed to assign language role on Discord.' };
        }
        if (guild.onboarding.allowMultipleLanguages) {
          actorMember.languageCodes.push(code);
        } else {
          const applied = applySelfRoleSelection(actorMember, 'language', code);
          actorMember.languageCodes = applied.languageCodes;
        }
      }

      await ctx.db.saveGuild(guild);
      return {
        ok: true,
        title: 'Language Role Updated',
        message: `Updated ${targetLang.flagEmoji} ${targetLang.nativeName} on Discord independently of your clan rank.`,
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
      const modKey = getStringArg(ctx.args, 'module') as keyof GuildState['modules'];
      if (!modKey) {
        return {
          ok: true,
          title: 'Guild Configuration',
          message: `Modules: ${Object.entries(guild.modules).map(([k, v]) => `${k}=${v}`).join(', ')}`,
        };
      }
      if (!(modKey in guild.modules)) {
        return {
          ok: false,
          title: 'Unknown Module',
          message: `Module "${modKey}" does not exist. Valid modules: ${Object.keys(guild.modules).join(', ')}`,
        };
      }
      const boolArg = getBoolArg(ctx.args, 'enabled');
      const nextEnabled = boolArg !== undefined ? boolArg : !guild.modules[modKey];
      guild.modules[modKey] = nextEnabled;
      await ctx.db.saveGuild(guild);
      return {
        ok: true,
        title: 'Module Configuration Updated',
        message: `Module "${modKey}" is now ${nextEnabled ? 'enabled' : 'disabled'}.`,
      };
    }

    case 'permissions matrix':
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
      const targetChannel = normalizeChannelName(
        getStringArg(ctx.args, 'channel'),
        guild.onboarding.rulesChannelName || '📜・rules',
      );
      if (!ctx.discordExecutor?.publishRulesMessage) {
        await ctx.db.appendAuditLog(guild.guildId, {
          id: `log-rulespub-fail-${Date.now()}`,
          guildId: guild.guildId,
          category: 'config_change',
          actorId: ctx.actorUserId,
          actorName: ctx.actorUsername,
          targetId: targetChannel,
          targetName: targetChannel,
          summary: `Rejected /rules publish to #${targetChannel}: Discord Gateway offline (prior status preserved).`,
          details: { ok: false, reason: 'discord_gateway_offline' },
          createdAt: now,
        });
        return {
          ok: false,
          title: 'Discord Gateway Offline',
          message: `Cannot publish rules to #${targetChannel} while the Discord Gateway is offline. Prior rules state was preserved.`,
        };
      }

      const res = await ctx.discordExecutor.publishRulesMessage({
        channelName: targetChannel,
        title: guild.onboarding.rulesTitle,
        body: guild.onboarding.rulesBody,
        reactionEmoji: guild.onboarding.rulesReactionEmoji || '✅',
      });

      if (!res.ok) {
        await ctx.db.appendAuditLog(guild.guildId, {
          id: `log-rulespub-err-${Date.now()}`,
          guildId: guild.guildId,
          category: 'config_change',
          actorId: ctx.actorUserId,
          actorName: ctx.actorUsername,
          targetId: targetChannel,
          targetName: targetChannel,
          summary: `Failed /rules publish to #${targetChannel}: ${res.error || 'Unknown Discord API error'} (prior status preserved).`,
          details: { ok: false, error: res.error ?? null },
          createdAt: now,
        });
        return {
          ok: false,
          title: 'Rules Publish Failed',
          message: res.error || `Could not publish rules message to #${targetChannel}.`,
        };
      }

      if (res.messageId) guild.onboarding.rulesMessageId = res.messageId;
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
        summary: `Published rules verification gate to #${targetChannel} (messageId=${guild.onboarding.rulesMessageId ?? 'confirmed'}).`,
        details: { liveDiscord: true, rulesMessageId: guild.onboarding.rulesMessageId },
        createdAt: now,
      });
      return {
        ok: true,
        title: 'Rules Gate Published',
        message: `Published rules & ${guild.onboarding.rulesReactionEmoji} reaction verification live to #${targetChannel}.`,
        data: { messageId: guild.onboarding.rulesMessageId },
      };
    }

    case 'custom-response': {
      const action = (getStringArg(ctx.args, 'action') || 'list').toLowerCase();
      if (action === 'add') {
        const trigger = getStringArg(ctx.args, 'trigger');
        const response = getStringArg(ctx.args, 'response');
        const matchMode = (getStringArg(ctx.args, 'match_mode', 'matchMode') || 'contains') as
          | 'contains'
          | 'exact'
          | 'startsWith';
        if (!trigger || !response) {
          return { ok: false, title: 'Missing Arguments', message: 'Provide both trigger and response text.' };
        }
        if (!['contains', 'exact', 'startsWith'].includes(matchMode)) {
          return { ok: false, title: 'Invalid Match Mode', message: 'match_mode must be contains, exact, or startsWith.' };
        }
        guild.customResponses.unshift({
          id: `cr-${Date.now()}`,
          trigger,
          matchMode,
          response,
          enabled: true,
          languageCode: null,
          createdBy: ctx.actorUsername,
          createdAt: now,
        });
        await ctx.db.saveGuild(guild);
        return {
          ok: true,
          title: 'Custom Response Added',
          message: `Trigger "${trigger}" (${matchMode}) saved (deterministic match, no AI).`,
        };
      }
      if (action === 'remove') {
        const trigger = getStringArg(ctx.args, 'trigger').toLowerCase();
        if (!trigger) {
          return { ok: false, title: 'Missing Trigger', message: 'Provide the trigger to remove.' };
        }
        const before = guild.customResponses.length;
        guild.customResponses = guild.customResponses.filter(
          (r) => r.trigger.toLowerCase() !== trigger && r.id.toLowerCase() !== trigger,
        );
        if (guild.customResponses.length === before) {
          return { ok: false, title: 'Not Found', message: `No custom response matching "${trigger}".` };
        }
        await ctx.db.saveGuild(guild);
        return { ok: true, title: 'Custom Response Removed', message: `Removed custom response "${trigger}".` };
      }
      if (action !== 'list') {
        return { ok: false, title: 'Invalid Action', message: 'action must be list, add, or remove.' };
      }
      return {
        ok: true,
        title: `Custom Responses (${guild.customResponses.length})`,
        message:
          guild.customResponses.length === 0
            ? 'No custom responses configured yet.'
            : guild.customResponses
                .map((r) => `[${r.enabled ? 'ON' : 'OFF'}] "${r.trigger}" -> ${r.response.slice(0, 60)}`)
                .join(' | '),
      };
    }

    case 'roles list':
      return {
        ok: true,
        title: 'Configured Role Panels',
        message: guild.rolePanels
          .map((p) => `${p.id}: ${p.title} [${p.mode}/${p.groupType}] (${p.published ? 'Published' : 'Draft'})`)
          .join(' | '),
      };

    case 'roles publish': {
      const panelId = getStringArg(ctx.args, 'panel_id', 'panelId');
      if (!panelId) {
        return { ok: false, title: 'Missing Panel ID', message: 'Provide panel_id (see /roles list).' };
      }
      const panel = guild.rolePanels.find((p) => p.id === panelId);
      if (!panel) {
        return { ok: false, title: 'Panel Not Found', message: `Role panel "${panelId}" does not exist.` };
      }

      if (!ctx.discordExecutor?.publishRolePanel) {
        await ctx.db.appendAuditLog(guild.guildId, {
          id: `log-rolepub-offline-${Date.now()}`,
          guildId: guild.guildId,
          category: 'role_change',
          actorId: ctx.actorUserId,
          actorName: ctx.actorUsername,
          targetId: panel.id,
          targetName: panel.title,
          summary: `Rejected /roles publish for "${panel.title}": Discord Gateway offline (prior status preserved).`,
          details: { ok: false, reason: 'discord_gateway_offline' },
          createdAt: now,
        });
        return {
          ok: false,
          title: 'Discord Gateway Offline',
          message: `Cannot publish "${panel.title}" to #${panel.channelName} while the Discord Gateway is offline.`,
        };
      }

      const pubRes = await ctx.discordExecutor.publishRolePanel(panel);
      if (!pubRes.ok) {
        await ctx.db.appendAuditLog(guild.guildId, {
          id: `log-rolepub-fail-${Date.now()}`,
          guildId: guild.guildId,
          category: 'role_change',
          actorId: ctx.actorUserId,
          actorName: ctx.actorUsername,
          targetId: panel.id,
          targetName: panel.title,
          summary: `Failed /roles publish for "${panel.title}": ${pubRes.error || 'Unknown Discord API error'} (prior status preserved).`,
          details: { ok: false, error: pubRes.error ?? null },
          createdAt: now,
        });
        return {
          ok: false,
          title: 'Discord Publish Failed',
          message: pubRes.error || `Failed to publish panel "${panel.title}" to #${panel.channelName}.`,
        };
      }

      panel.published = true;
      panel.publishedAt = now;
      if (pubRes.messageId) panel.publishedMessageId = pubRes.messageId;
      await ctx.db.saveGuild(guild);
      await ctx.db.appendAuditLog(guild.guildId, {
        id: `log-rolepub-${Date.now()}`,
        guildId: guild.guildId,
        category: 'role_change',
        actorId: ctx.actorUserId,
        actorName: ctx.actorUsername,
        targetId: panel.id,
        targetName: panel.title,
        summary: `Published role panel "${panel.title}" live to #${panel.channelName} (panel publish only; no server setup run).`,
        details: {
          mode: panel.mode,
          itemsCount: panel.items.length,
          liveDiscord: true,
          messageId: panel.publishedMessageId ?? null,
        },
        createdAt: now,
      });
      return {
        ok: true,
        title: 'Role Panel Published',
        message: `Published "${panel.title}" live to #${panel.channelName} without altering any other server structure.`,
        data: { panelId: panel.id, messageId: panel.publishedMessageId ?? null },
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
      const content = getStringArg(ctx.args, 'message', 'content');
      if (!content) {
        return { ok: false, title: 'Missing Message', message: 'Provide a sample message to evaluate.' };
      }
      const ch = normalizeChannelName(getStringArg(ctx.args, 'channel'), ctx.channelName || '💬・general-chat');
      const mentions = Math.max(0, Math.min(50, getIntArg(ctx.args, 'mentions') ?? 0));
      const engine = new RuleBasedAutoModEngine();
      const res = engine.evaluateMessage(guild.automod, {
        userId: 'sim-test',
        username: ctx.actorUsername,
        content,
        channelName: ch,
        userRoles: ['🌱 Recruit'],
        mentionCount: mentions,
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
      const messageId = getStringArg(ctx.args, 'message_id', 'messageId');
      const reason = getStringArg(ctx.args, 'reason', 'notes');
      if (!messageId || !reason) {
        return {
          ok: false,
          title: 'Invalid Arguments',
          message: 'Both message_id and reason are required to submit a false-positive report.',
        };
      }
      const channelName = normalizeChannelName(getStringArg(ctx.args, 'channel'), ctx.channelName || '💬・general-chat');
      const sampleContent = getStringArg(ctx.args, 'content') || `Message ID ${messageId}`;
      const report = {
        id: `fp-${Date.now()}`,
        reporterUserId: ctx.actorUserId,
        reporterUsername: ctx.actorUsername,
        channelName,
        sampleContent,
        ruleHits: getStringArg(ctx.args, 'rules')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: `[msg:${messageId}] ${reason}`,
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
        summary: `Submitted AutoMod false-positive report for message ${messageId} in #${channelName}: ${reason}`,
        details: { reportId: report.id, messageId },
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
      const confirmed = getBoolArg(ctx.args, 'confirmed');
      if (DESTRUCTIVE_MOD_ACTIONS.has(action) && confirmed === false) {
        return {
          ok: false,
          title: 'Moderation Confirmation Required',
          message: `Action "/${action}" requires explicit confirmation before execution.`,
        };
      }

      const reason =
        getStringArg(ctx.args, 'reason') ||
        (action === 'untimeout' || action === 'purge' || action === 'slowmode' ? 'Moderator action' : '');

      if (!reason || reason.length < 2) {
        return {
          ok: false,
          title: 'Missing Reason',
          message: `A clear reason (at least 2 characters) is required for "/${action}".`,
        };
      }

      // Validate target arguments BEFORE any side effects
      if (action === 'unban') {
        const uid = getStringArg(ctx.args, 'user_id', 'userId');
        if (!uid) {
          return { ok: false, title: 'Missing User ID', message: 'Provide user_id to unban.' };
        }
        return createModerationCase(guild, ctx, action, uid, uid, reason, null);
      }

      if (action === 'purge') {
        const amount = getIntArg(ctx.args, 'amount', 'count');
        if (amount === null || amount < 1 || amount > 100) {
          return { ok: false, title: 'Invalid Amount', message: 'Purge amount must be between 1 and 100 messages.' };
        }
        const ch = normalizeChannelName(getStringArg(ctx.args, 'channel'), ctx.channelName);
        return createModerationCase(guild, ctx, action, ch, `#${ch}`, reason, amount);
      }

      if (action === 'slowmode') {
        const seconds = getIntArg(ctx.args, 'seconds');
        if (seconds === null || seconds < 0 || seconds > 21600) {
          return { ok: false, title: 'Invalid Slowmode', message: 'Slowmode seconds must be between 0 and 21600.' };
        }
        const ch = normalizeChannelName(getStringArg(ctx.args, 'channel'), ctx.channelName);
        return createModerationCase(guild, ctx, action, ch, `#${ch}`, reason, seconds);
      }

      if (action === 'lock' || action === 'unlock') {
        const ch = getStringArg(ctx.args, 'channel');
        if (!ch) {
          return { ok: false, title: 'Missing Channel', message: `Specify channel to ${action}.` };
        }
        return createModerationCase(guild, ctx, action, ch, `#${ch}`, reason, null);
      }

      const targetRef = getStringArg(ctx.args, 'member', 'user_id', 'userId');
      if (!targetRef) {
        return { ok: false, title: 'Missing Target Member', message: `Specify the target member for "/${action}".` };
      }

      let durationMinutes: number | null = null;
      if (action === 'timeout' || action === 'tempban') {
        const dur = getIntArg(ctx.args, 'duration', 'minutes');
        const maxDur = action === 'timeout' ? 40320 : 525600;
        if (dur === null || dur < 1 || dur > maxDur) {
          return {
            ok: false,
            title: 'Invalid Duration',
            message: `Duration for "/${action}" must be between 1 and ${maxDur} minutes.`,
          };
        }
        durationMinutes = dur;
      }

      let deleteMessageSeconds: number | undefined;
      if (action === 'ban') {
        const pruneDays = getIntArg(ctx.args, 'delete_message_days');
        if (pruneDays !== null) {
          if (pruneDays < 0 || pruneDays > 7) {
            return { ok: false, title: 'Invalid Prune Days', message: 'delete_message_days must be between 0 and 7.' };
          }
          deleteMessageSeconds = pruneDays * 86400;
        }
      }

      const targetMember = findMember(guild, targetRef);
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
        targetMember?.userId ?? targetRef.replace(/^<@!?(\d+)>$/, '$1'),
        targetMember?.username ?? (getStringArg(ctx.args, 'member_username') || targetRef),
        reason,
        durationMinutes,
        deleteMessageSeconds,
      );
    }

    case 'warnings': {
      const target = getStringArg(ctx.args, 'member', 'user_id').toLowerCase();
      if (!target) {
        return { ok: false, title: 'Missing Member', message: 'Specify a member to look up warnings.' };
      }
      const list = guild.warnings.filter((w) => w.username.toLowerCase() === target || w.userId.toLowerCase() === target);
      return {
        ok: true,
        title: 'Warning History',
        message:
          list.length === 0
            ? 'No warnings found.'
            : list.map((w) => `${w.caseId}: ${w.username} — ${w.reason}`).join(' | '),
      };
    }

    case 'modlog': {
      const limit = Math.max(1, Math.min(25, getIntArg(ctx.args, 'limit') ?? 5));
      const slice = guild.moderationCases.slice(0, limit);
      return {
        ok: true,
        title: 'Recent Moderation Cases',
        message:
          slice.length === 0
            ? 'No moderation cases logged.'
            : slice.map((c) => `${c.caseId} [${c.action}/${c.discordExecutionStatus}] ${c.targetUsername}: ${c.reason}`).join(' | '),
      };
    }

    case 'case': {
      const cid = getStringArg(ctx.args, 'case_id', 'caseId').toUpperCase();
      if (!cid) {
        return { ok: false, title: 'Missing Case ID', message: 'Provide a case_id such as CASE-0001.' };
      }
      const found = guild.moderationCases.find((c) => c.caseId === cid);
      return found
        ? {
            ok: true,
            title: found.caseId,
            message: `${found.action} on ${found.targetUsername} by ${found.moderatorUsername} [${found.discordExecutionStatus}] — ${found.reason}`,
          }
        : { ok: false, title: 'Case Not Found', message: `No moderation case matching "${cid}".` };
    }

    case 'appeal': {
      const cid = getStringArg(ctx.args, 'case_id', 'caseId').toUpperCase();
      const reason = getStringArg(ctx.args, 'reason');
      if (!cid || !reason) {
        return { ok: false, title: 'Invalid Arguments', message: 'Both case_id and reason are required.' };
      }
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
      const title = getStringArg(ctx.args, 'title');
      const description = getStringArg(ctx.args, 'description');
      if (!title || !description) {
        return { ok: false, title: 'Missing Arguments', message: 'Provide both title and description.' };
      }
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
      const question = getStringArg(ctx.args, 'question');
      const optsRaw = getStringArg(ctx.args, 'options');
      const opts = optsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
      if (!question || opts.length < 2) {
        return { ok: false, title: 'Invalid Poll', message: 'Provide a question and at least 2 comma-separated options.' };
      }
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
      const prize = getStringArg(ctx.args, 'prize');
      const minutes = getIntArg(ctx.args, 'minutes');
      if (!prize || minutes === null || minutes < 1 || minutes > 43200) {
        return { ok: false, title: 'Invalid Giveaway', message: 'Provide prize and minutes between 1 and 43200.' };
      }
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
      const title = getStringArg(ctx.args, 'title');
      if (!title) {
        return { ok: false, title: 'Missing Title', message: 'Provide an event title.' };
      }
      const eventType = (getStringArg(ctx.args, 'type') || 'raid') as 'raid' | 'dungeon' | 'community' | 'tournament';
      const validEventType = ['raid', 'dungeon', 'community', 'tournament'].includes(eventType);
      if (!validEventType) {
        return { ok: false, title: 'Invalid Event Type', message: 'Choose raid, dungeon, community, or tournament.' };
      }
      const gameId = guild.games[0]?.id ?? '';
      if ((eventType === 'raid' || eventType === 'dungeon') && !gameId) {
        return { ok: false, title: 'No Game Configured', message: 'Add a game in the dashboard before scheduling a raid or dungeon.' };
      }
      guild.events.unshift({
        id: `event-${Date.now()}`,
        title,
        description: 'Scheduled via /event command.',
        eventType,
        gameId,
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
      const minutes = getIntArg(ctx.args, 'minutes');
      const message = getStringArg(ctx.args, 'message');
      if (minutes === null || minutes < 1 || minutes > 525600 || !message) {
        return { ok: false, title: 'Invalid Reminder', message: 'Provide minutes (1–525600) and reminder message.' };
      }
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
      const category = getStringArg(ctx.args, 'category') === 'staff' ? 'staff' : 'clan';
      const summary = getStringArg(ctx.args, 'summary');
      if (!summary) {
        return { ok: false, title: 'Missing Summary', message: 'Provide an application summary.' };
      }
      const matchingForm = guild.recruitmentForms.find((f) => f.category === category) ?? guild.recruitmentForms[0];
      guild.recruitmentApplications.unshift({
        id: `app-${Date.now()}`,
        formId: matchingForm?.id || 'form-clan',
        category,
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
      const subject = getStringArg(ctx.args, 'subject');
      if (!subject) {
        return { ok: false, title: 'Missing Subject', message: 'Provide a ticket subject.' };
      }
      guild.ticketSequence += 1;
      const num = guild.ticketSequence;
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
            authorRole: ctx.actorRank ?? 'Unranked',
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
        message: `${guild.teams.length} active squad(s) · ${guild.raidSchedules.length} scheduled raid(s) · ${guild.gamingClasses.length} game classes`,
      };

    case 'members': {
      const q = getStringArg(ctx.args, 'query').toLowerCase();
      const matched = guild.members.filter(
        (m) =>
          !m.isDeparted &&
          (!q || m.username.toLowerCase().includes(q) || (m.clanRank ?? 'unranked').toLowerCase().includes(q)),
      );
      return {
        ok: true,
        title: `Clan Directory (${matched.length})`,
        message: matched.slice(0, 6).map((m) => `${m.username} [${m.clanRank ?? 'Unranked'}]`).join(' · ') || 'No matching members.',
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
      return { ok: false, title: 'Unhandled Command', message: `Command "/${normalized}" has no execution handler.` };
  }
}

async function createModerationCase(
  guild: GuildState,
  ctx: CommandExecutionContext,
  action: ModerationActionType,
  targetUserId: string,
  targetUsername: string,
  reason: string,
  durationOrValue: number | null,
  deleteMessageSeconds?: number,
): Promise<CommandExecutionResult> {
  const now = new Date().toISOString();
  const expiresAt =
    (action === 'timeout' || action === 'tempban') && durationOrValue
      ? new Date(Date.now() + durationOrValue * 60_000).toISOString()
      : null;

  if (!ctx.discordExecutor?.executeModeration) {
    await ctx.db.appendAuditLog(guild.guildId, {
      id: `log-mod-offline-${Date.now()}`,
      guildId: guild.guildId,
      category: 'moderation',
      actorId: ctx.actorUserId,
      actorName: ctx.actorUsername,
      targetId: targetUserId,
      targetName: targetUsername,
      summary: `Blocked /${action} against ${targetUsername}: Discord Gateway offline (no action applied).`,
      details: { action, reason, discordExecutionStatus: 'dry_run_no_bot' },
      createdAt: now,
    });
    return {
      ok: false,
      title: 'Discord Gateway Offline',
      message: `Cannot execute "/${action}" while the Discord Gateway is offline. No Discord moderation action or active penalty was applied.`,
      data: { discordExecutionStatus: 'dry_run_no_bot' },
    };
  }

  const execRes = await ctx.discordExecutor.executeModeration({
    action,
    targetUserId,
    reason,
    durationMinutes: durationOrValue,
    channelName: normalizeChannelName(getStringArg(ctx.args, 'channel'), ctx.channelName),
    deleteMessageSeconds,
  });

  const discordExecutionStatus = execRes.ok ? 'verified_live' : 'failed';
  const discordError = execRes.ok ? null : execRes.error || 'Discord API rejected moderation operation.';

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
    durationMinutes: durationOrValue,
    expiresAt,
    active: discordExecutionStatus === 'verified_live' && action !== 'untimeout' && action !== 'unban' && action !== 'unlock',
    channelName: normalizeChannelName(getStringArg(ctx.args, 'channel'), ctx.channelName),
    discordExecutionStatus,
    discordError,
    createdAt: now,
  });

  if (discordExecutionStatus === 'verified_live') {
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
        : `Executed ${action} (${caseId}, verified_live) against ${targetUsername}: ${reason}`,
    details: { caseId, action, durationMinutes: durationOrValue, discordExecutionStatus, discordError },
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
    title: `${caseId} Executed Live`,
    message: `Action "${action}" executed live on Discord and logged against ${targetUsername}.`,
    data: { caseId, discordExecutionStatus },
  };
}
