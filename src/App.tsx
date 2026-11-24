import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Compass,
  Gavel,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Swords,
  Terminal,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AuthUserSession,
  AutoModConfig,
  ClanRankName,
  GuildModulesConfig,
  GuildState,
  ModerationActionType,
  RoleCategory,
  TicketRecord,
} from '../packages/shared/src/types';
import type { CompletenessReport } from '../packages/localization/src/engine';
import { AuthGate } from './components/AuthGate';
import { apiRequest } from './lib/api';
import { OverviewView } from './components/views/OverviewView';
import { ServerManagementView } from './components/views/ServerManagementView';
import { LanguagesView } from './components/views/LanguagesView';
import { MembersView } from './components/views/MembersView';
import { RolesView } from './components/views/RolesView';
import { ModerationView } from './components/views/ModerationView';
import { AutoModView } from './components/views/AutoModView';
import { LoggingView } from './components/views/LoggingView';
import { TicketsView } from './components/views/TicketsView';
import { RecruitmentView } from './components/views/RecruitmentView';
import { CommunityView } from './components/views/CommunityView';
import { ClanView } from './components/views/ClanView';
import { CommandsView, type CommandDesc } from './components/views/CommandsView';
import { SettingsView } from './components/views/SettingsView';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'discovery', label: 'Server Management', icon: Compass },
  { id: 'languages', label: 'Languages', icon: Globe },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'roles', label: 'Roles & Panels', icon: Sparkles },
  { id: 'moderation', label: 'Moderation', icon: Gavel },
  { id: 'automod', label: 'AutoMod', icon: ShieldAlert },
  { id: 'logging', label: 'Logging', icon: ScrollText },
  { id: 'tickets', label: 'Tickets', icon: MessageSquare },
  { id: 'recruitment', label: 'Recruitment', icon: UserPlus },
  { id: 'community', label: 'Community', icon: Activity },
  { id: 'clan', label: 'Clan Management', icon: Swords },
  { id: 'commands', label: 'Commands & Tasks', icon: Terminal },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface GuildStateResponse {
  guild: GuildState;
  languageCompleteness: Record<string, CompletenessReport>;
  commands: CommandDesc[];
  botStatus: {
    connected: boolean;
    mode: 'live_gateway' | 'standby_no_token';
    botTag: string | null;
    guildCount: number;
    lastError: string | null;
    startedAt: string | null;
  };
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserSession | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [data, setData] = useState<GuildStateResponse | null>(null);
  const [databaseAdapter, setDatabaseAdapter] = useState('local');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const guildId = 'shadowslayers-primary';

  const refreshState = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [stateRes, healthRes] = await Promise.all([
        apiRequest<GuildStateResponse>(`/api/guild/${guildId}/state`, { token }),
        apiRequest<{ databaseAdapter: string }>('/api/health'),
      ]);
      setData(stateRes);
      setDatabaseAdapter(healthRes.databaseAdapter);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load guild state');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  if (!token || !user) {
    return (
      <AuthGate
        onAuthenticated={(newToken, newUser) => {
          setToken(newToken);
          setUser(newUser);
        }}
      />
    );
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#0B0D12] text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-slate-800/90 bg-[#0F131C] flex flex-col transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/src/assets/images/crest_shadowslayers_1795519523634.jpg"
              alt="ShadowSlayers Crest"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-md object-cover border border-amber-500/40 shrink-0"
            />
            <span className="font-display text-sm font-bold tracking-wide text-slate-100 truncate">
              ShadowSlayers
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#171C28] border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/90 text-xs text-slate-400">
          <p className="font-medium text-slate-200 truncate">{user.username}</p>
          <p className="text-amber-400 mt-0.5">{user.clanRank}</p>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean 3-Zone Top Bar */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-800/90 bg-[#0F131C]/90 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-800 text-slate-300"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display text-base font-semibold text-slate-100 whitespace-nowrap truncate">
              {activeNav.label}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs text-slate-400 whitespace-nowrap">
            <span>{data?.guild.guildName || 'ShadowSlayers – Legends of Elements'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">DB: {databaseAdapter}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setToken(null);
                setUser(null);
                setData(null);
              }}
              className="px-3.5 py-2 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {loadError && (
            <div className="mb-6 p-4 rounded-xl border border-red-500/40 bg-red-950/30 text-sm text-red-200">
              {loadError}
            </div>
          )}

          {loading && !data ? (
            <div className="space-y-4">
              <div className="h-44 rounded-xl bg-[#121620] border border-slate-800 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-24 rounded-xl bg-[#121620] border border-slate-800 animate-pulse" />
                ))}
              </div>
            </div>
          ) : data ? (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  guild={data.guild}
                  botStatus={data.botStatus}
                  databaseAdapter={databaseAdapter}
                  onNavigate={setActiveTab}
                />
              )}

              {activeTab === 'discovery' && (
                <ServerManagementView
                  guild={data.guild}
                  onRescan={async () => {
                    await apiRequest(`/api/guild/${guildId}/discovery/rescan`, { method: 'POST', token });
                    await refreshState();
                  }}
                  onConfirmSetup={async () => {
                    await apiRequest(`/api/guild/${guildId}/discovery/confirm`, {
                      method: 'POST',
                      token,
                      body: { confirmed: true },
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'languages' && (
                <LanguagesView
                  guild={data.guild}
                  completeness={data.languageCompleteness}
                  onCreateLanguage={async (payload) => {
                    await apiRequest(`/api/guild/${guildId}/languages`, { method: 'POST', token, body: payload });
                    await refreshState();
                  }}
                  onSaveTranslations={async (code, payload) => {
                    await apiRequest(`/api/guild/${guildId}/languages/${code}/translations`, {
                      method: 'PATCH',
                      token,
                      body: payload,
                    });
                    await refreshState();
                  }}
                  onReviewLanguage={async (code, status, notes) => {
                    await apiRequest(`/api/guild/${guildId}/languages/${code}/review`, {
                      method: 'POST',
                      token,
                      body: { status, notes },
                    });
                    await refreshState();
                  }}
                  onCreateChannels={async (code) => {
                    await apiRequest(`/api/guild/${guildId}/languages/${code}/create-channels`, {
                      method: 'POST',
                      token,
                      body: { confirmed: true },
                    });
                    await refreshState();
                  }}
                  onToggleLanguage={async (code) => {
                    await apiRequest(`/api/guild/${guildId}/languages/${code}/toggle`, { method: 'POST', token });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'members' && (
                <MembersView
                  guild={data.guild}
                  onUpdateMember={async (userId, patch: { clanRank?: ClanRankName; languageCodes?: string[] }) => {
                    await apiRequest(`/api/guild/${guildId}/members/${userId}`, {
                      method: 'PATCH',
                      token,
                      body: patch,
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'roles' && (
                <RolesView
                  guild={data.guild}
                  onCreatePanel={async (payload: {
                    title: string;
                    description: string;
                    channelName: string;
                    mode: 'buttons' | 'select_menu' | 'reactions';
                    groupType: 'exclusive' | 'multiple';
                    category: RoleCategory;
                    items: { roleId: string; label: string; emoji: string; description: string }[];
                  }) => {
                    await apiRequest(`/api/guild/${guildId}/role-panels`, { method: 'POST', token, body: payload });
                    await refreshState();
                  }}
                  onPublishPanel={async (panelId) => {
                    await apiRequest(`/api/guild/${guildId}/role-panels/${panelId}/publish`, {
                      method: 'POST',
                      token,
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'moderation' && (
                <ModerationView
                  guild={data.guild}
                  onExecuteModeration={async (payload: {
                    action: ModerationActionType;
                    targetUserId: string;
                    targetUsername: string;
                    reason: string;
                    durationMinutes: number | null;
                  }) => {
                    await apiRequest(`/api/guild/${guildId}/moderation`, { method: 'POST', token, body: payload });
                    await refreshState();
                  }}
                  onReviewAppeal={async (appealId, status, reviewNotes) => {
                    await apiRequest(`/api/guild/${guildId}/appeals/${appealId}/review`, {
                      method: 'POST',
                      token,
                      body: { status, reviewNotes },
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'automod' && (
                <AutoModView
                  guild={data.guild}
                  onSaveAutoMod={async (config: AutoModConfig) => {
                    await apiRequest(`/api/guild/${guildId}/automod`, { method: 'PUT', token, body: config });
                    await refreshState();
                  }}
                  onTestAutoMod={async (payload) => {
                    const res = await apiRequest<{
                      evaluation: {
                        triggered: boolean;
                        exempt: boolean;
                        ruleHits: string[];
                        recommendedActions: string[];
                        reason: string | null;
                      };
                    }>(`/api/guild/${guildId}/automod/test`, { method: 'POST', token, body: payload });
                    return res.evaluation;
                  }}
                />
              )}

              {activeTab === 'logging' && (
                <LoggingView
                  guild={data.guild}
                  onSaveLogging={async (payload) => {
                    await apiRequest(`/api/guild/${guildId}/logging/config`, {
                      method: 'PUT',
                      token,
                      body: payload,
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'tickets' && (
                <TicketsView
                  guild={data.guild}
                  onCreateTicket={async (payload: {
                    category: TicketRecord['category'];
                    subject: string;
                    initialMessage: string;
                  }) => {
                    await apiRequest(`/api/guild/${guildId}/tickets`, { method: 'POST', token, body: payload });
                    await refreshState();
                  }}
                  onSendMessage={async (ticketId, content) => {
                    await apiRequest(`/api/guild/${guildId}/tickets/${ticketId}/messages`, {
                      method: 'POST',
                      token,
                      body: { content },
                    });
                    await refreshState();
                  }}
                  onTicketAction={async (ticketId, action) => {
                    await apiRequest(`/api/guild/${guildId}/tickets/${ticketId}/action`, {
                      method: 'POST',
                      token,
                      body: { action },
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'recruitment' && (
                <RecruitmentView
                  guild={data.guild}
                  onSubmitApplication={async (formId, answers) => {
                    await apiRequest(`/api/guild/${guildId}/recruitment/apply`, {
                      method: 'POST',
                      token,
                      body: { formId, answers },
                    });
                    await refreshState();
                  }}
                  onReviewApplication={async (appId, status, reviewNotes) => {
                    await apiRequest(`/api/guild/${guildId}/recruitment/${appId}/review`, {
                      method: 'POST',
                      token,
                      body: { status, reviewNotes },
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'community' && (
                <CommunityView
                  guild={data.guild}
                  onCreateSuggestion={async (title, description) => {
                    await apiRequest(`/api/guild/${guildId}/community/suggestions`, {
                      method: 'POST',
                      token,
                      body: { title, description },
                    });
                    await refreshState();
                  }}
                  onVoteSuggestion={async (id, direction) => {
                    await apiRequest(`/api/guild/${guildId}/community/suggestions/${id}/vote`, {
                      method: 'POST',
                      token,
                      body: { direction },
                    });
                    await refreshState();
                  }}
                  onCreatePoll={async (question, options) => {
                    await apiRequest(`/api/guild/${guildId}/community/polls`, {
                      method: 'POST',
                      token,
                      body: { question, options },
                    });
                    await refreshState();
                  }}
                  onVotePoll={async (pollId, optionId) => {
                    await apiRequest(`/api/guild/${guildId}/community/polls/${pollId}/vote`, {
                      method: 'POST',
                      token,
                      body: { optionId },
                    });
                    await refreshState();
                  }}
                  onCreateGiveaway={async (prize, minutes) => {
                    await apiRequest(`/api/guild/${guildId}/community/giveaways`, {
                      method: 'POST',
                      token,
                      body: { prize, minutes },
                    });
                    await refreshState();
                  }}
                  onCreateAnnouncement={async (title, channelName, content, minutesDelay) => {
                    await apiRequest(`/api/guild/${guildId}/community/announcements`, {
                      method: 'POST',
                      token,
                      body: { title, channelName, content, minutesDelay },
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'clan' && (
                <ClanView
                  guild={data.guild}
                  onCreateGame={async (name, shortCode) => {
                    await apiRequest(`/api/guild/${guildId}/clan/games`, {
                      method: 'POST',
                      token,
                      body: { name, shortCode },
                    });
                    await refreshState();
                  }}
                  onCreateTeam={async (name, gameId, description, maxSize) => {
                    await apiRequest(`/api/guild/${guildId}/clan/teams`, {
                      method: 'POST',
                      token,
                      body: { name, gameId, description, maxSize },
                    });
                    await refreshState();
                  }}
                  onCreateRaid={async (title, kind, gameId) => {
                    await apiRequest(`/api/guild/${guildId}/clan/raids`, {
                      method: 'POST',
                      token,
                      body: { title, kind, gameId },
                    });
                    await refreshState();
                  }}
                />
              )}

              {activeTab === 'commands' && (
                <CommandsView
                  guild={data.guild}
                  commands={data.commands}
                  onExecuteCommand={async (command, args) => {
                    const res = await apiRequest<{ result: { ok: boolean; title: string; message: string } }>(
                      `/api/guild/${guildId}/commands/execute`,
                      { method: 'POST', token, body: { command, args } },
                    );
                    await refreshState();
                    return res.result;
                  }}
                  onRunSchedulerTick={async () => {
                    const res = await apiRequest<{ executed: number }>(`/api/guild/${guildId}/scheduler/tick`, {
                      method: 'POST',
                      token,
                    });
                    await refreshState();
                    return res.executed;
                  }}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  guild={data.guild}
                  databaseAdapter={databaseAdapter}
                  onSaveSettings={async (patch: { modules?: GuildModulesConfig }) => {
                    await apiRequest(`/api/guild/${guildId}/settings`, {
                      method: 'PATCH',
                      token,
                      body: patch,
                    });
                    await refreshState();
                  }}
                  onDownloadBackup={async () => {
                    const backup = await apiRequest<Record<string, unknown>>(`/api/guild/${guildId}/backup`, { token });
                    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `shadowslayers-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                />
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
