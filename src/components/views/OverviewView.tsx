import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  CircleHelp,
  Database,
  FileClock,
  Globe,
  Radio,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { GuildState } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';
import { EmptyState, MetricCard, PageHeading, StatusPill } from '../ui/DashboardPrimitives';
import bannerUrl from '../../assets/images/Banner.jpg';

type ConnectionState = 'checking' | 'online' | 'offline';

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
  botStatus: BotStatus | null;
  databaseAdapter: string | null;
  apiStatus: ConnectionState;
  onNavigate: (tab: string) => void;
  canNavigate: (tab: string) => boolean;
}

function formatUptime(startedAt: string | null, now: number): string | null {
  if (!startedAt) return null;
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs) || startedAtMs > now) return null;
  const totalMinutes = Math.floor((now - startedAtMs) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getActivityDays(logs: GuildState['logs'], locale: string, now: number) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const start = date.getTime();
    const end = start + 86_400_000;
    return {
      label: formatter.format(date),
      count: logs.filter((log) => {
        const time = Date.parse(log.createdAt);
        return Number.isFinite(time) && time >= start && time < end;
      }).length,
    };
  });
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  guild,
  botStatus,
  databaseAdapter,
  apiStatus,
  onNavigate,
  canNavigate,
}) => {
  const { locale, t } = useLocale();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const trackedMembers = guild.members.filter((member) => !member.isDeparted);
  const linkedRoles = guild.discovery.roles.filter(
    (role) => role.discordRoleId !== null && role.lifecycleState === 'mapped',
  );
  const openTickets = guild.tickets.filter((ticket) => ticket.status !== 'closed');
  const activityDays = useMemo(
    () => getActivityDays(guild.logs, locale === 'sv' ? 'sv-SE' : 'en-US', now),
    [guild.logs, locale, now],
  );
  const maxActivity = Math.max(1, ...activityDays.map((day) => day.count));
  const uptime = formatUptime(botStatus?.startedAt ?? null, now);
  const botConnection = botStatus?.connected ? 'success' : botStatus ? 'warning' : 'neutral';

  const dateFormatter = new Intl.DateTimeFormat(locale === 'sv' ? 'sv-SE' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('Control center')}
        title={guild.guildName}
        description={t('Obsidian Sanctum Command Overview')}
        actions={
          <StatusPill
            tone={botConnection}
            label={
              botStatus?.connected
                ? t('Bot connected')
                : botStatus
                  ? t('Bot unavailable')
                  : t('Connection status has not been reported.')
            }
          />
        }
      />

      <section className="relative isolate overflow-hidden rounded-2xl border border-violet-300/15 bg-[#151124] shadow-2xl shadow-black/30">
        <img
          src={bannerUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-20 h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#100e1a] via-[#100e1a]/95 to-[#100e1a]/55" />
        <div className="grid min-h-56 items-center gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:p-10">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
              {guild.discovery.categories.length} · {t('Server Overview')}
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-white sm:text-3xl">
              {t('Obsidian Sanctum Command Overview')}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              {t('Centralized Discord Server Governance')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canNavigate('discovery') && <button type="button" className="ss-button-primary" onClick={() => onNavigate('discovery')}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t('Open server management')}
              <ArrowUpRight className="h-4 w-4 opacity-70" aria-hidden="true" />
            </button>}
            {canNavigate('languages') && <button type="button" className="ss-button-secondary" onClick={() => onNavigate('languages')}>
              <Globe className="h-4 w-4" aria-hidden="true" />
              {t('Open language settings')}
            </button>}
          </div>
        </div>
      </section>

      <section aria-label={t('Server statistics')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          label={t('Tracked members')}
          value={trackedMembers.length}
          detail={t('Members synced to this guild record')}
          icon={Users}
          tone="neutral"
        />
        <MetricCard
          label={t('Mapped Discord roles')}
          value={linkedRoles.length}
          detail={t('Roles linked to live Discord IDs')}
          icon={ShieldCheck}
          tone="success"
        />
        <MetricCard
          label={t('Open tickets')}
          value={openTickets.length}
          detail={t('Tickets with status other than closed')}
          icon={CircleHelp}
          tone={openTickets.length > 0 ? 'warning' : 'neutral'}
        />
        <MetricCard
          label={t('Bot availability')}
          value={botStatus?.connected ? t('Online') : botStatus ? t('Offline') : t('Unavailable')}
          detail={botStatus?.botTag ?? t('Connection status has not been reported.')}
          icon={Radio}
          tone={botStatus?.connected ? 'success' : botStatus ? 'warning' : 'neutral'}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <article className="app-panel min-w-0 p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">{t('Audit activity, last 7 days')}</h2>
              <p className="mt-1 text-xs text-slate-400">{t('Activity shown is based on retained audit entries.')}</p>
            </div>
            {canNavigate('logging') && <button type="button" className="ss-button-quiet" onClick={() => onNavigate('logging')}>
              {t('View all activity')}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>}
          </div>
          {guild.logs.length === 0 ? (
            <EmptyState
              title={t('No recent activity')}
              description={t('No retained audit entries for this period.')}
            />
          ) : (
            <div
              className="grid h-48 grid-cols-7 items-end gap-3 border-b border-white/10 px-1 pb-3"
              role="img"
              aria-label={t('Audit activity chart')}
            >
              {activityDays.map((day) => (
                <div key={day.label} className="flex h-full flex-col items-center justify-end gap-2">
                  <span className="text-xs tabular-nums text-slate-300">{day.count}</span>
                  <div className="flex h-32 w-full items-end rounded-t-md bg-violet-400/[0.06]">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-violet-700 to-violet-400 shadow-[0_0_22px_rgba(139,53,245,0.22)]"
                      style={{ height: `${Math.max(day.count > 0 ? 10 : 0, (day.count / maxActivity) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400">{day.label}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <Activity className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
            {t('Retained audit entries')}: {guild.logs.length}
          </p>
        </article>

        <article className="app-panel min-w-0 p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">{t('Quick actions')}</h2>
              <p className="mt-1 text-xs text-slate-400">{t('Jump to common guild tasks')}</p>
            </div>
            <FileClock className="h-5 w-5 text-violet-300" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {[
              { label: 'Manage members', tab: 'members', icon: Users },
              { label: 'Manage roles', tab: 'roles', icon: ShieldCheck },
              { label: 'Review tickets', tab: 'tickets', icon: CircleHelp },
              { label: 'Review moderation', tab: 'moderation', icon: Activity },
            ].filter((action) => canNavigate(action.tab)).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.tab}
                  type="button"
                  className="group flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-violet-300/25 hover:bg-violet-400/[0.07] focus-visible:outline-offset-2"
                  onClick={() => onNavigate(action.tab)}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-violet-300" aria-hidden="true" />
                    {t(action.label)}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-slate-500 transition group-hover:text-violet-200" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <article className="app-panel min-w-0 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">{t('Recent audit activity')}</h2>
              <p className="mt-1 text-xs text-slate-400">{t('Recent audit entries')}</p>
            </div>
            {canNavigate('logging') && <button type="button" className="ss-button-quiet" onClick={() => onNavigate('logging')}>
              {t('View logs')}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>}
          </div>
          {guild.logs.length === 0 ? (
            <EmptyState title={t('No recent activity')} description={t('No audit activity has been recorded yet.')} />
          ) : (
            <ul className="divide-y divide-white/[0.07]">
              {guild.logs.slice(0, 6).map((log) => (
                <li key={log.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="break-words text-sm text-slate-200">{log.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {log.category} · {log.actorName}
                      {log.targetName ? ` · ${log.targetName}` : ''}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500" dateTime={log.createdAt}>
                    {dateFormatter.format(new Date(log.createdAt))}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="app-panel min-w-0 p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold text-white">{t('System status')}</h2>
            <p className="mt-1 text-xs text-slate-400">{t('Live status reported by the trusted API')}</p>
          </div>
          <div className="divide-y divide-white/[0.07]">
            <StatusRow
              icon={Server}
              label={t('API status')}
              value={apiStatus === 'online' ? t('API is responding') : apiStatus === 'offline' ? t('API health check failed') : t('Checking…')}
              tone={apiStatus === 'online' ? 'success' : apiStatus === 'offline' ? 'danger' : 'neutral'}
            />
            <StatusRow
              icon={Database}
              label={t('Database status')}
              value={databaseAdapter ? t('Database adapter') + `: ${databaseAdapter}` : t('Unavailable')}
              tone={apiStatus === 'online' && databaseAdapter === 'firestore' ? 'success' : 'neutral'}
            />
            <StatusRow
              icon={Radio}
              label={t('Discord status')}
              value={botStatus?.connected ? botStatus.botTag ?? t('Connected') : botStatus ? t('Not connected') : t('Unavailable')}
              tone={botStatus?.connected ? 'success' : botStatus ? 'warning' : 'neutral'}
            />
            <StatusRow
              icon={CalendarClock}
              label={t('Scheduler status')}
              value={t('Status not reported by the API')}
              tone="neutral"
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">{t('The scheduler status is not exposed by the current API.')}</p>
        </article>
      </section>

      {botStatus?.lastError && !botStatus.connected && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100" role="status">
          {botStatus.lastError}
        </div>
      )}
    </div>
  );
};

const StatusRow: React.FC<{
  icon: typeof Server;
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}> = ({ icon: Icon, label, value, tone }) => (
  <div className="flex items-start justify-between gap-4 py-3.5">
    <span className="flex min-w-0 items-center gap-3 text-sm text-slate-300">
      <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
    <StatusPill label={value} tone={tone} />
  </div>
);
