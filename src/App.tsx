import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  CircleHelp,
  Compass,
  Database,
  FileClock,
  Gavel,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Server,
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
import { PrivacyDeletionView } from './components/PrivacyDeletionView';
import { apiRequest } from './lib/api';
import { useLocale } from './lib/LocaleProvider';
import type { CommandDesc } from './components/views/CommandsView';
import { StatusPill } from './components/ui/DashboardPrimitives';
import guildCrestUrl from './assets/images/Icon.jpg';

const OverviewView = lazy(() => import('./components/views/OverviewView').then((module) => ({ default: module.OverviewView })));
const StatisticsView = lazy(() => import('./components/views/StatisticsView').then((module) => ({ default: module.StatisticsView })));
const ServerManagementView = lazy(() => import('./components/views/ServerManagementView').then((module) => ({ default: module.ServerManagementView })));
const LanguagesView = lazy(() => import('./components/views/LanguagesView').then((module) => ({ default: module.LanguagesView })));
const MembersView = lazy(() => import('./components/views/MembersView').then((module) => ({ default: module.MembersView })));
const RolesView = lazy(() => import('./components/views/RolesView').then((module) => ({ default: module.RolesView })));
const ModerationView = lazy(() => import('./components/views/ModerationView').then((module) => ({ default: module.ModerationView })));
const AutoModView = lazy(() => import('./components/views/AutoModView').then((module) => ({ default: module.AutoModView })));
const LoggingView = lazy(() => import('./components/views/LoggingView').then((module) => ({ default: module.LoggingView })));
const TicketsView = lazy(() => import('./components/views/TicketsView').then((module) => ({ default: module.TicketsView })));
const RecruitmentView = lazy(() => import('./components/views/RecruitmentView').then((module) => ({ default: module.RecruitmentView })));
const CommunityView = lazy(() => import('./components/views/CommunityView').then((module) => ({ default: module.CommunityView })));
const ClanView = lazy(() => import('./components/views/ClanView').then((module) => ({ default: module.ClanView })));
const CommandsView = lazy(() => import('./components/views/CommandsView').then((module) => ({ default: module.CommandsView })));
const SettingsView = lazy(() => import('./components/views/SettingsView').then((module) => ({ default: module.SettingsView })));

const PRIMARY_NAV = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'discovery', label: 'Server Overview', icon: Server },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'roles', label: 'Roles', icon: Sparkles },
  { id: 'channels', label: 'Channels', icon: MessageSquare },
  { id: 'tickets', label: 'Tickets', icon: CircleHelp },
  { id: 'moderation', label: 'Moderation', icon: Gavel },
  { id: 'automod', label: 'Automations', icon: ShieldAlert },
  { id: 'statistics', label: 'Statistics', icon: ChartNoAxesColumnIncreasing },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'logging', label: 'Logs', icon: ScrollText },
  { id: 'support', label: 'Support', icon: CircleHelp },
];

const GUILD_TOOLS_NAV = [
  { id: 'languages', label: 'Languages', icon: Globe },
  { id: 'recruitment', label: 'Recruitment', icon: UserPlus },
  { id: 'community', label: 'Community', icon: Activity },
  { id: 'clan', label: 'Clan', icon: Swords },
  { id: 'commands', label: 'Commands', icon: Terminal },
];

const TAB_MODULE: Partial<Record<string, keyof GuildModulesConfig>> = {
  discovery: 'discovery', channels: 'discovery', roles: 'roles',
  tickets: 'tickets', support: 'tickets', moderation: 'moderation', automod: 'automod',
  statistics: 'progression', logging: 'logging', languages: 'multilingual',
  recruitment: 'recruitment', community: 'community', clan: 'clan',
};

type ConnectionState = 'checking' | 'online' | 'offline';

interface ApiHealthResponse {
  ok: boolean;
  databaseAdapter: string;
  timestamp: string;
  bot: GuildStateResponse['botStatus'];
}

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
  } | null;
}

interface GuildOption {
  guildId: string;
  name: string;
}

export default function App() {
  const { locale, setLocale, t } = useLocale();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserSession | null>(null);
  const [guildOptions, setGuildOptions] = useState<GuildOption[]>([]);
  const [requestedTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [data, setData] = useState<GuildStateResponse | null>(null);
  const [health, setHealth] = useState<ApiHealthResponse | null>(null);
  const [apiStatus, setApiStatus] = useState<ConnectionState>('checking');
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState(false);

  const guildId = user?.guildId;

  const refreshState = useCallback(async () => {
    if (!token || !guildId) return;
    setLoading(true);
    setLoadError(null);
    const [stateResult, healthResult] = await Promise.allSettled([
      apiRequest<GuildStateResponse>(`/api/guild/${guildId}/state`, { token }),
      apiRequest<ApiHealthResponse>('/api/health'),
    ]);
    if (stateResult.status === 'fulfilled') {
      setData(stateResult.value);
    } else {
      setLoadError(stateResult.reason instanceof Error ? stateResult.reason.message : t('Unable to load guild data'));
    }
    if (healthResult.status === 'fulfilled' && healthResult.value.ok) {
      setHealth(healthResult.value);
      setApiStatus('online');
    } else {
      setHealth(null);
      setApiStatus('offline');
    }
    setLoading(false);
  }, [token, guildId, t]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) {
      setGuildOptions([]);
      return;
    }
    apiRequest<{ guilds: GuildOption[] }>('/api/auth/guilds', { token })
      .then(({ guilds }) => setGuildOptions(guilds))
      .catch((err) => setLoadError(err instanceof Error ? err.message : t('Failed to load authorized servers')));
  }, [token, t]);

  const signOut = () => {
    setToken(null);
    setUser(null);
    setData(null);
    setHealth(null);
    setApiStatus('checking');
    setActiveTab('overview');
  };

  if (privacyMode) {
    return (
      <PrivacyDeletionView
        onBack={() => setPrivacyMode(false)}
        onCompleted={signOut}
      />
    );
  }

  if (!token || !user || !guildId) {
    return (
      <AuthGate
        onPrivacyRequest={() => setPrivacyMode(true)}
        onAuthenticated={(newToken, newUser) => {
          setToken(newToken);
          setUser(newUser);
        }}
      />
    );
  }

  const isTabEnabled = (tab: string) => {
    const module = TAB_MODULE[tab];
    return !module || data?.guild.modules[module] === true;
  };
  const primaryNav = PRIMARY_NAV.filter((item) => isTabEnabled(item.id));
  const guildToolsNav = GUILD_TOOLS_NAV.filter((item) => isTabEnabled(item.id));
  const allNavItems = [...primaryNav, ...guildToolsNav];
  const activeTab = allNavItems.some((item) => item.id === requestedTab) ? requestedTab : 'overview';
  const activeNav = allNavItems.find((item) => item.id === activeTab) ?? PRIMARY_NAV[0];
  const displayName = guildOptions.find((guild) => guild.guildId === guildId)?.name
    ?? data?.guild.guildName
    ?? (guildOptions.length === 0 ? t('Loading…') : guildOptions[0].name);
  const botStatus = data?.botStatus ?? health?.bot ?? null;
  const startedAtMs = botStatus?.startedAt ? Date.parse(botStatus.startedAt) : NaN;
  const uptimeMinutes = Number.isFinite(startedAtMs) && startedAtMs <= now
    ? Math.floor((now - startedAtMs) / 60_000)
    : null;
  const uptimeLabel = uptimeMinutes === null
    ? t('Uptime unavailable')
    : uptimeMinutes >= 1440
      ? `${Math.floor(uptimeMinutes / 1440)}d ${Math.floor((uptimeMinutes % 1440) / 60)}h`
      : uptimeMinutes >= 60
        ? `${Math.floor(uptimeMinutes / 60)}h ${uptimeMinutes % 60}m`
        : `${uptimeMinutes}m`;

  const renderNavigationItem = (item: (typeof PRIMARY_NAV)[number] | (typeof GUILD_TOOLS_NAV)[number]) => {
    const Icon = item.icon;
    const isActive = item.id === activeTab;
    return (
      <button
        key={item.id}
        type="button"
        title={sidebarCollapsed ? t(item.label) : undefined}
        aria-label={t(item.label)}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => {
          setActiveTab(item.id);
          setMobileMenuOpen(false);
        }}
        className={`app-nav-item flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${
          sidebarCollapsed ? 'justify-center' : ''
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {!sidebarCollapsed && <span className="truncate">{t(item.label)}</span>}
      </button>
    );
  };

  const botTone = botStatus?.connected ? 'success' : botStatus ? 'warning' : 'neutral';
  const botLabel = botStatus?.connected
    ? t('Connected')
    : botStatus
      ? t('Not connected')
      : t('Unavailable');

  return (
    <div className="app-shell flex bg-[#090812] text-slate-100">
      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label={t('Close navigation')}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-white/[0.08] bg-[#100e1a] transition-[transform,width] duration-200 lg:static lg:translate-x-0 ${
          sidebarCollapsed ? 'lg:w-[5.25rem]' : 'lg:w-64'
        } ${mobileMenuOpen ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full'}`}
        aria-label={t('Dashboard navigation')}
      >
        <div className={`flex h-[4.5rem] shrink-0 items-center border-b border-white/[0.08] px-4 ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
          <img
            src={guildCrestUrl}
            alt=""
            aria-hidden="true"
            className="h-10 w-10 shrink-0 rounded-xl border border-violet-300/25 object-cover shadow-lg shadow-violet-950/30"
          />
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold tracking-wide text-white">ShadowSlayers</p>
              <p className="truncate text-[10px] uppercase tracking-[0.16em] text-violet-300">{t('Control center')}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white lg:hidden"
            aria-label={t('Close navigation')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label={t('Primary navigation')}>
          {primaryNav.map(renderNavigationItem)}
          <div className={`my-3 border-t border-white/[0.08] pt-3 ${sidebarCollapsed ? 'mx-2' : ''}`}>
            {!sidebarCollapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {t('Guild tools')}
              </p>
            )}
            <div className="space-y-1">{guildToolsNav.map(renderNavigationItem)}</div>
          </div>
        </nav>

        <div className={`shrink-0 border-t border-white/[0.08] p-3 ${sidebarCollapsed ? 'text-center' : ''}`}>
          <div className="flex items-center gap-2.5">
            <span className={`app-status-dot ${botStatus?.connected ? 'text-emerald-400' : 'text-amber-300'}`} aria-hidden="true" />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200">{t('Discord connection')}</p>
                <p className="truncate text-[11px] text-slate-400">{botLabel}</p>
                {botStatus?.startedAt && (
                  <p className="mt-1 text-[10px] text-slate-500">{t('Uptime')}: {uptimeLabel}</p>
                )}
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full border border-white/10 object-cover" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-400/10 text-xs font-semibold text-violet-200">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-200">{user.username}</p>
                <p className="truncate text-[10px] text-slate-500">{displayName}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#100e1a]/95 px-3 py-3 backdrop-blur-xl sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/[0.06] lg:hidden"
              aria-label={t('Open navigation')}
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              className="hidden rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/[0.06] lg:inline-flex"
              aria-label={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
              title={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
            >
              {sidebarCollapsed
                ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
            </button>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold text-white sm:text-lg">{t(activeNav.label)}</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{displayName}</p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:gap-3">
            <label className="sr-only" htmlFor="active-guild">{t('Select Discord server')}</label>
            <select
              id="active-guild"
              aria-label={t('Select Discord server')}
              value={guildId}
              disabled={guildOptions.length <= 1}
              onChange={(event) => {
                setUser((current) => current ? { ...current, guildId: event.target.value } : current);
                setData(null);
                setLoadError(null);
              }}
              className="app-input min-w-0 max-w-[min(48vw,15rem)] px-3 py-2 text-xs sm:max-w-56"
            >
              {guildOptions.length === 0 && <option value={guildId}>{displayName}</option>}
              {guildOptions.map((guild) => (
                <option key={guild.guildId} value={guild.guildId}>{guild.name}</option>
              ))}
            </select>

            <StatusPill label={apiStatus === 'checking' ? t('Checking…') : apiStatus === 'online' ? t('API is responding') : t('API health check failed')} tone={apiStatus === 'online' ? 'success' : apiStatus === 'offline' ? 'danger' : 'neutral'} />
            <StatusPill label={botLabel} tone={botTone} />

            {isTabEnabled('logging') && <button
              type="button"
              onClick={() => setActiveTab('logging')}
              className="relative rounded-xl border border-white/10 p-2 text-slate-300 transition hover:border-violet-300/25 hover:bg-violet-400/[0.08] hover:text-white"
              aria-label={t('Notifications and recent activity')}
              title={t('Notifications and recent activity')}
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
            </button>}

            <label className="sr-only" htmlFor="dashboard-language">{t('Language')}</label>
            <select
              id="dashboard-language"
              value={locale}
              onChange={(event) => setLocale(event.target.value === 'sv' ? 'sv' : 'en')}
              className="app-input px-2.5 py-2 text-xs"
              aria-label={t('Language')}
            >
              <option value="en">EN</option>
              <option value="sv">SV</option>
            </select>

            <details className="relative">
              <summary
                className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-white/10 p-1.5 pr-2.5 text-sm text-slate-200 hover:bg-white/[0.06] [&::-webkit-details-marker]:hidden"
                aria-label={t('Open profile menu')}
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-400/15 text-xs font-semibold text-violet-100">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-white/10 bg-[#151124] p-3 shadow-2xl shadow-black/50">
                <p className="truncate text-sm font-medium text-white">{user.username}</p>
                <p className="mt-1 truncate text-xs text-slate-400">{displayName}</p>
                <button
                  type="button"
                  onClick={() => setPrivacyMode(true)}
                  className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"
                >
                  {t('Delete my ShadowSlayers data')}
                </button>
                <button type="button" onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-200 hover:bg-red-400/10">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {t('Sign out')}
                </button>
              </div>
            </details>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          {loadError && (
            <div className="mb-6 rounded-xl border border-red-400/25 bg-red-400/[0.07] p-4 text-sm text-red-200" role="alert">
              {loadError}
            </div>
          )}

          {loading && !data ? (
            <div className="space-y-4" aria-label={t('Loading guild data…')} aria-busy="true">
              <div className="h-44 rounded-xl bg-[#121620] border border-slate-800 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-24 rounded-xl bg-[#121620] border border-slate-800 animate-pulse" />
                ))}
              </div>
            </div>
          ) : data ? (
            <Suspense fallback={<div className="app-panel p-6 text-sm text-slate-400" role="status">{t('Loading dashboard…')}</div>}>
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  guild={data.guild}
                  botStatus={data.botStatus}
                  databaseAdapter={health?.databaseAdapter ?? null}
                  apiStatus={apiStatus}
                  onNavigate={setActiveTab}
                />
              )}

              {activeTab === 'statistics' && <StatisticsView guild={data.guild} />}

              {(activeTab === 'discovery' || activeTab === 'channels') && (
                <ServerManagementView
                  guild={data.guild}
                  onRescan={async () => {
                    await apiRequest(`/api/guild/${guildId}/discovery/rescan`, { method: 'POST', token });
                    await refreshState();
                  }}
                  onConfirmSetup={async (mode) => {
                    const res = await apiRequest<{
                      executionMode?: string;
                      report?: {
                        appliedCount?: number;
                        failedCount?: number;
                        skippedConflicts?: number;
                        skippedManualItems?: string[];
                      };
                    }>(`/api/guild/${guildId}/discovery/confirm`, {
                      method: 'POST',
                      token,
                      body: { confirmed: true, mode },
                    });
                    await refreshState();
                    return res;
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
                  onPublishRules={async () => {
                    await apiRequest(`/api/guild/${guildId}/rules/publish`, { method: 'POST', token });
                    await refreshState();
                  }}
                  onVerifyRules={async (userId, verified) => {
                    await apiRequest(`/api/guild/${guildId}/onboarding/${userId}/verify-rules`, {
                      method: 'POST',
                      token,
                      body: { verified },
                    });
                    await refreshState();
                  }}
                  onGrantActivePlayer={async (userId) => {
                    await apiRequest(`/api/guild/${guildId}/onboarding/${userId}/active-player`, {
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
                  onReportFalsePositive={async (payload) => {
                    await apiRequest(`/api/guild/${guildId}/automod/false-positives`, {
                      method: 'POST',
                      token,
                      body: payload,
                    });
                    await refreshState();
                  }}
                  onResolveFalsePositive={async (reportId, status) => {
                    await apiRequest(`/api/guild/${guildId}/automod/false-positives/${reportId}`, {
                      method: 'PATCH',
                      token,
                      body: { status },
                    });
                    await refreshState();
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

              {(activeTab === 'tickets' || activeTab === 'support') && (
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
                  onUpdateGame={async (gameId, patch) => {
                    await apiRequest(`/api/guild/${guildId}/clan/games/${gameId}`, {
                      method: 'PATCH',
                      token,
                      body: patch,
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
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  guild={data.guild}
                  databaseAdapter={health?.databaseAdapter ?? t('Unavailable')}
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
            </Suspense>
          ) : !loading && (
            <div className="app-panel mx-auto max-w-2xl p-8 text-center" role="status">
              <Server className="mx-auto h-8 w-8 text-violet-300" aria-hidden="true" />
              <h2 className="mt-4 font-display text-xl font-semibold text-white">{t('No server data is available for this account.')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{loadError ?? t('Unable to load guild data')}</p>
              <button type="button" className="ss-button-primary mx-auto mt-5" onClick={() => void refreshState()}>
                {t('Retry')}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
