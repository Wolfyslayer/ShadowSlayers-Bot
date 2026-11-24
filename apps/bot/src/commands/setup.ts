import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { DatabaseAdapter } from '../../../../packages/database/src/adapter.ts';
import { hasCapability } from '../../../../packages/permissions/src/hierarchy.ts';
import type { ClanRankName } from '../../../../packages/shared/src/types.ts';
import {
  discoverLiveDiscordGuild,
  executeAdditiveSetupOnDiscordGuild,
  type GuildLike,
  type SetupExecutionReport,
} from '../services/discovery.ts';

export interface SetupFlowSession {
  id: string;
  guildId: string;
  initiatorUserId: string;
  initiatorUsername: string;
  stage: 'preview' | 'awaiting_full_confirm' | 'completed' | 'cancelled';
  createdAt: number;
  expiresAt: number;
}

const setupSessions = new Map<string, SetupFlowSession>();

export function createSetupSession(
  guildId: string,
  initiatorUserId: string,
  initiatorUsername: string,
): SetupFlowSession {
  const now = Date.now();
  const id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const session: SetupFlowSession = {
    id,
    guildId,
    initiatorUserId,
    initiatorUsername,
    stage: 'preview',
    createdAt: now,
    expiresAt: now + 15 * 60_000,
  };
  setupSessions.set(id, session);
  return session;
}

export function getSetupSession(sessionId: string): SetupFlowSession | null {
  const s = setupSessions.get(sessionId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    setupSessions.delete(sessionId);
    return null;
  }
  return s;
}

export function buildSetupPreviewSummary(snapshot: ReturnType<typeof discoverLiveDiscordGuild>): string {
  const mappedRoles = snapshot.roles.filter((r) => r.lifecycleState === 'mapped').length;
  const missingRoles = snapshot.roles
    .filter((r) => r.lifecycleState === 'missing' && !r.excludeFromAutoSetup)
    .map((r) => r.name);
  const manualRoles = snapshot.roles
    .filter((r) => r.lifecycleState === 'requires_manual_setup' || (r.lifecycleState === 'missing' && r.excludeFromAutoSetup))
    .map((r) => r.name);
  const conflictingRoles = snapshot.roles.filter((r) => r.lifecycleState === 'conflicting').map((r) => r.name);
  const missingCats = snapshot.categories.filter((c) => c.lifecycleState === 'missing').map((c) => c.name);
  const missingChannels = snapshot.categories
    .flatMap((c) => c.channels)
    .filter((ch) => ch.lifecycleState === 'missing')
    .map((ch) => `#${ch.name}`);
  const conflictingItems = [
    ...conflictingRoles,
    ...snapshot.categories.filter((c) => c.lifecycleState === 'conflicting').map((c) => c.name),
  ];

  const lines = [
    `**ShadowSlayers Non-Destructive Setup Preview**`,
    `• Mapped legacy roles: **${mappedRoles}** | Missing auto-creatable roles: **${missingRoles.length}**`,
    `• Missing categories: **${missingCats.length}** | Missing channels: **${missingChannels.length}**`,
    `• Misplaced channels: **${snapshot.incorrectPlacements.length}** | Type mismatches: **${snapshot.incorrectTypes.length}** | Permission diffs: **${snapshot.permissionDifferences.length}**`,
  ];

  if (manualRoles.length > 0) {
    lines.push(`• Manual Admin Setup Only (excluded from auto-create): ${manualRoles.join(', ')}`);
  }
  if (missingRoles.length > 0) lines.push(`• Missing Roles: ${missingRoles.join(', ')}`);
  if (missingCats.length > 0) lines.push(`• Missing Categories: ${missingCats.join(', ')}`);
  if (snapshot.incorrectPlacements.length > 0) {
    lines.push(
      `• Misplaced Channels (preserved, not moved): ${snapshot.incorrectPlacements
        .slice(0, 5)
        .map((p) => `${p.channelName} (${p.actualCategoryName ?? 'Uncategorized'} -> ${p.expectedCategoryName})`)
        .join('; ')}`,
    );
  }
  if (snapshot.incorrectTypes.length > 0) {
    lines.push(
      `• Channel Type Mismatches (preserved): ${snapshot.incorrectTypes
        .slice(0, 5)
        .map((t) => `${t.channelName} (${t.actualType} vs ${t.expectedType})`)
        .join('; ')}`,
    );
  }
  if (conflictingItems.length > 0) {
    lines.push(
      `⚠️ **Conflicts Requiring Admin Resolution (${conflictingItems.length})**: ${conflictingItems.join(', ')} — auto-creation blocked to prevent duplicates.`,
    );
  }
  lines.push(
    `_Existing roles, IDs, colors, positions, and permission overwrites will never be deleted, renamed, moved, or overwritten._`,
  );
  return lines.join('\n');
}

export function buildSetupActionRow(sessionId: string, stage: 'preview' | 'awaiting_full_confirm' | 'retry') {
  if (stage === 'awaiting_full_confirm') {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`setup:full_confirm:${sessionId}`)
        .setLabel('Confirm Full Setup (Additive Only)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`setup:cancel:${sessionId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (stage === 'retry') {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`setup:retry:${sessionId}`)
        .setLabel('Retry Failed Items Only')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`setup:cancel:${sessionId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`setup:missing:${sessionId}`)
      .setLabel('Missing only')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`setup:full_preview:${sessionId}`)
      .setLabel('Full setup')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`setup:cancel:${sessionId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}

export interface SetupInteractionContext {
  guildId: string;
  actorUserId: string;
  actorUsername: string;
  actorRank: ClanRankName;
  discordGuild: GuildLike;
  db: DatabaseAdapter;
}

export async function handleSetupButtonAction(
  customId: string,
  ctx: SetupInteractionContext,
): Promise<{
  ok: boolean;
  ephemeral: true;
  content: string;
  nextStage?: 'awaiting_full_confirm' | 'retry' | null;
  sessionId?: string;
  report?: SetupExecutionReport;
}> {
  const parts = customId.split(':');
  if (parts.length !== 3 || parts[0] !== 'setup') {
    return { ok: false, ephemeral: true, content: 'Invalid setup action.' };
  }
  const [, action, sessionId] = parts;
  const session = getSetupSession(sessionId);
  if (!session) {
    return { ok: false, ephemeral: true, content: 'This `/setup` confirmation session has expired. Run `/setup` again.' };
  }
  if (session.initiatorUserId !== ctx.actorUserId) {
    return {
      ok: false,
      ephemeral: true,
      content: `Only the initiating administrator (**${session.initiatorUsername}**) can confirm or cancel this /setup workflow.`,
    };
  }
  if (!hasCapability(ctx.actorRank, 'discovery.apply')) {
    return {
      ok: false,
      ephemeral: true,
      content: `Permission denied: your current clan rank (${ctx.actorRank}) is no longer authorized to apply server setup.`,
    };
  }

  const guildState = await ctx.db.getGuild(ctx.guildId);
  if (!guildState) {
    return { ok: false, ephemeral: true, content: 'Guild state record not found.' };
  }

  if (action === 'cancel') {
    session.stage = 'cancelled';
    setupSessions.delete(sessionId);
    await ctx.db.appendAuditLog(ctx.guildId, {
      id: `log-setup-cancel-${Date.now()}`,
      guildId: ctx.guildId,
      category: 'config_change',
      actorId: ctx.actorUserId,
      actorName: ctx.actorUsername,
      targetId: ctx.guildId,
      targetName: guildState.guildName,
      summary: 'Cancelled `/setup` interactive workflow prior to execution.',
      details: { sessionId },
      createdAt: new Date().toISOString(),
    });
    return { ok: true, ephemeral: true, content: 'Setup cancelled. Zero changes were made to the Discord server.', nextStage: null };
  }

  if (action === 'full_preview') {
    session.stage = 'awaiting_full_confirm';
    return {
      ok: true,
      ephemeral: true,
      nextStage: 'awaiting_full_confirm',
      sessionId,
      content:
        '⚠️ **Second Confirmation Required for Full Setup**\nThis will create all missing required AND optional template roles, categories, and channels additively without modifying or deleting any existing server resources. Confirm to proceed.',
    };
  }

  const mode: 'missing_only' | 'full_setup' =
    action === 'full_confirm' ? 'full_setup' : 'missing_only';

  await ctx.db.appendAuditLog(ctx.guildId, {
    id: `log-setup-start-${Date.now()}`,
    guildId: ctx.guildId,
    category: 'config_change',
    actorId: ctx.actorUserId,
    actorName: ctx.actorUsername,
    targetId: ctx.guildId,
    targetName: guildState.guildName,
    summary: `Started additive \`/setup\` (${mode}) after re-verifying permissions & Discord state.`,
    details: { mode, sessionId },
    createdAt: new Date().toISOString(),
  });

  const report = await executeAdditiveSetupOnDiscordGuild(ctx.discordGuild, guildState.discovery, {
    mode,
    actorUsername: ctx.actorUsername,
  });

  guildState.discovery = report.snapshot;
  await ctx.db.saveGuild(guildState);

  await ctx.db.appendAuditLog(ctx.guildId, {
    id: `log-setup-done-${Date.now()}`,
    guildId: ctx.guildId,
    category: 'config_change',
    actorId: ctx.actorUserId,
    actorName: ctx.actorUsername,
    targetId: ctx.guildId,
    targetName: guildState.guildName,
    summary: `Completed \`/setup\` (${mode}): ${report.appliedCount} applied, ${report.failedCount} failed, ${report.skippedConflicts} conflict(s) skipped.`,
    details: {
      mode,
      appliedCount: report.appliedCount,
      failedCount: report.failedCount,
      skippedConflicts: report.skippedConflicts,
    },
    createdAt: new Date().toISOString(),
  });

  if (report.failedCount > 0) {
    return {
      ok: false,
      ephemeral: true,
      nextStage: 'retry',
      sessionId,
      report,
      content: [
        `**Setup Partially Applied (${report.appliedCount} applied, ${report.failedCount} failed)**`,
        ...report.failures.map((f) => `• ❌ **${f.targetName}**: ${f.error}`),
        `Click **Retry Failed Items Only** to safely re-attempt failed additions without duplicating applied resources.`,
      ].join('\n'),
    };
  }

  session.stage = 'completed';
  setupSessions.delete(sessionId);
  return {
    ok: true,
    ephemeral: true,
    nextStage: null,
    report,
    content: `✅ **Setup Complete (${mode})**: ${report.appliedCount} additive item(s) created and verified via Discord API; ${report.skippedConflicts} conflicting item(s) preserved for manual resolution.`,
  };
}

export async function handleLiveSlashSetup(
  interaction: ChatInputCommandInteraction,
  ctx: Omit<SetupInteractionContext, 'discordGuild'> & { discordGuild: GuildLike },
): Promise<void> {
  if (!hasCapability(ctx.actorRank, 'discovery.apply')) {
    await interaction.reply({
      ephemeral: true,
      content: `Permission denied: your rank (${ctx.actorRank}) cannot execute /setup.`,
    });
    return;
  }

  const guildState = await ctx.db.getGuild(ctx.guildId);
  if (!guildState) {
    await interaction.reply({ ephemeral: true, content: 'Guild state record not found.' });
    return;
  }

  await ctx.discordGuild.roles.fetch?.();
  await ctx.discordGuild.channels.fetch?.();
  const snapshot = discoverLiveDiscordGuild(ctx.discordGuild, guildState.discovery);
  guildState.discovery = snapshot;
  await ctx.db.saveGuild(guildState);

  const session = createSetupSession(ctx.guildId, ctx.actorUserId, ctx.actorUsername);
  await ctx.db.appendAuditLog(ctx.guildId, {
    id: `log-setup-preview-${Date.now()}`,
    guildId: ctx.guildId,
    category: 'config_change',
    actorId: ctx.actorUserId,
    actorName: ctx.actorUsername,
    targetId: ctx.guildId,
    targetName: guildState.guildName,
    summary: `Opened ephemeral \`/setup\` preview (${snapshot.missingCount} missing, ${snapshot.conflictsCount} conflicts).`,
    details: { sessionId: session.id },
    createdAt: new Date().toISOString(),
  });

  await interaction.reply({
    ephemeral: true,
    content: buildSetupPreviewSummary(snapshot),
    components: [buildSetupActionRow(session.id, 'preview')],
  });
}

export async function dispatchLiveSetupButton(
  interaction: ButtonInteraction,
  ctx: SetupInteractionContext,
): Promise<void> {
  const result = await handleSetupButtonAction(interaction.customId, ctx);
  const components =
    result.nextStage && result.sessionId ? [buildSetupActionRow(result.sessionId, result.nextStage)] : [];
  await interaction.reply({
    ephemeral: true,
    content: result.content,
    components,
  });
}
