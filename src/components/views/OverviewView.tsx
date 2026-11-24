import React from 'react';
import type { GuildState } from '../../../packages/shared/src/types';
import bannerUrl from '../../assets/images/banner_sanctum_1795519524069.jpg';

interface BotStatus {
  connected: boolean;
  mode: 'live_gateway' | 'standby_no_token';
  botTag: string | null;
  guildCount: number;
  lastError: string | null;
  startedAt: string | null;
}

interface OverviewViewProps {
  guild: GuildState;
  botStatus: BotStatus;
  databaseAdapter: string;
  onNavigate: (tab: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  guild,
  botStatus,
  databaseAdapter,
  onNavigate,
}) => {
  const activeMembers = guild.members.filter((m) => !m.isDeparted);
  const enabledLanguages = guild.languages.filter((l) => l.enabled);
  const openTickets = guild.tickets.filter((t) => t.status !== 'closed');
  const activeCases = guild.moderationCases.filter((c) => c.active);
  const pendingApps = guild.recruitmentApplications.filter((a) => a.status === 'pending');
  const pendingTasks = guild.scheduledTasks.filter((t) => t.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Primary Sanctum Banner */}
      <div className="relative rounded-xl border border-slate-800 overflow-hidden bg-[#121620]">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <p className="text-xs text-amber-400 font-medium mb-2">
                {guild.guildName} · {guild.discovery.categories.length} Categories · {guild.discovery.roles.length} Mapped Roles
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-100 leading-tight text-balance">
                Obsidian Sanctum Command Overview
              </h2>
              <p className="text-sm text-slate-300 mt-3 max-w-2xl leading-relaxed">
                Centralized Discord server governance across Gate of Shadows, Language Realms, Legends of Elements, and Inner Sanctum. All operations are deterministic, audit-logged, and hierarchy-verified.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('discovery')}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Inspect Server Discovery
              </button>
              <button
                type="button"
                onClick={() => onNavigate('languages')}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] text-slate-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Manage Languages ({enabledLanguages.length})
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[200px] lg:min-h-full bg-[#0B0D12]">
            <img
              src={bannerUrl}
              alt="ShadowSlayers Sanctum Hall"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#121620] via-transparent to-transparent lg:block hidden" />
          </div>
        </div>
      </div>

      {/* 4-Column Tabular KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-800 bg-[#121620]">
          <p className="text-xs text-slate-400">Active Tracked Members</p>
          <p className="font-mono-tabular text-2xl font-semibold text-slate-100 mt-1">
            {activeMembers.length}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Verified: {activeMembers.filter((m) => m.verified).length} · Teams: {guild.teams.length}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-[#121620]">
          <p className="text-xs text-slate-400">Moderation & AutoMod</p>
          <p className="font-mono-tabular text-2xl font-semibold text-slate-100 mt-1">
            {activeCases.length} <span className="text-sm font-normal text-slate-400">active cases</span>
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Appeals pending: {guild.appeals.filter((a) => a.status === 'pending').length} · AutoMod: {guild.automod.enabled ? 'Enabled' : 'Disabled'}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-[#121620]">
          <p className="text-xs text-slate-400">Support & Recruitment</p>
          <p className="font-mono-tabular text-2xl font-semibold text-slate-100 mt-1">
            {openTickets.length} <span className="text-sm font-normal text-slate-400">open tickets</span>
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Pending applications: {pendingApps.length}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-[#121620]">
          <p className="text-xs text-slate-400">Gateway & Persistence</p>
          <p className="font-mono-tabular text-lg font-semibold text-slate-100 mt-1 truncate">
            {botStatus.connected ? botStatus.botTag || 'Connected' : 'Bot control connection unavailable'}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Adapter: {databaseAdapter} · Tasks queued: {pendingTasks.length}
          </p>
        </div>
      </div>

      {/* Recent Audit Events & Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#121620] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold text-slate-100">Recent Audit Activity</h3>
            <button
              type="button"
              onClick={() => onNavigate('logging')}
              className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              View All Logs
            </button>
          </div>
          <div className="divide-y divide-slate-800/80">
            {guild.logs.slice(0, 6).map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">{log.summary}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {log.category} · Actor: {log.actorName}
                    {log.targetName ? ` · Target: ${log.targetName}` : ''}
                  </p>
                </div>
                <span className="font-mono-tabular text-xs text-slate-500 shrink-0">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold text-slate-100">Scheduled Operations</h3>
            <button
              type="button"
              onClick={() => onNavigate('commands')}
              className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              Inspect Queue
            </button>
          </div>
          <div className="divide-y divide-slate-800/80">
            {guild.scheduledTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200">{task.type}</span>
                  <span className="font-mono-tabular text-xs text-amber-400">{task.status}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{task.description}</p>
                <p className="font-mono-tabular text-xs text-slate-500 mt-1">
                  Run at: {new Date(task.runAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
