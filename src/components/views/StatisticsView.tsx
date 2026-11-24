import React, { useMemo } from 'react';
import { Activity, CircleHelp, ShieldCheck, Users } from 'lucide-react';
import type { GuildState } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';
import { EmptyState, MetricCard, PageHeading } from '../ui/DashboardPrimitives';

export const StatisticsView: React.FC<{ guild: GuildState }> = ({ guild }) => {
  const { locale, t } = useLocale();
  const dateLocale = locale === 'sv' ? 'sv-SE' : 'en-US';
  const activeMembers = guild.members.filter((member) => !member.isDeparted);
  const mappedRoles = guild.discovery.roles.filter(
    (role) => role.discordRoleId !== null && role.lifecycleState === 'mapped',
  );
  const openTickets = guild.tickets.filter((ticket) => ticket.status !== 'closed');
  const activity = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 14 }, (_, index) => {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (13 - index));
      const start = day.getTime();
      const end = start + 86_400_000;
      return {
        key: day.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short' }).format(day),
        count: guild.logs.filter((log) => {
          const createdAt = Date.parse(log.createdAt);
          return Number.isFinite(createdAt) && createdAt >= start && createdAt < end;
        }).length,
      };
    });
  }, [dateLocale, guild.logs]);
  const maxActivity = Math.max(1, ...activity.map((day) => day.count));
  const hasActivity = activity.some((day) => day.count > 0);

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={guild.guildName}
        title={t('Statistics')}
        description={t('Statistics based on the guild data and retained audit logs currently available to this dashboard.')}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4" aria-label={t('Server statistics')}>
        <MetricCard
          label={t('Tracked members')}
          value={activeMembers.length}
          detail={t('Members synced to this guild record')}
          icon={Users}
        />
        <MetricCard
          label={t('Mapped Discord roles')}
          value={mappedRoles.length}
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
          label={t('Retained audit entries')}
          value={guild.logs.length}
          detail={t('Activity shown is based on retained audit entries.')}
          icon={Activity}
        />
      </section>

      <section className="app-panel p-5 sm:p-6">
        <div className="mb-6">
          <h2 className="font-display text-lg font-semibold text-white">{t('Audit activity, last 14 days')}</h2>
          <p className="mt-1 text-xs text-slate-400">{t('Activity shown is based on retained audit entries.')}</p>
        </div>
        {!hasActivity ? (
          <EmptyState
            title={t('No recent activity')}
            description={t('No retained audit entries for this period.')}
          />
        ) : (
          <div
            className="grid h-64 grid-cols-7 items-end gap-2 sm:grid-cols-14 sm:gap-3"
            role="img"
            aria-label={t('Audit activity chart')}
          >
            {activity.map((day) => (
              <div key={day.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                <span className="text-[11px] tabular-nums text-slate-400">{day.count}</span>
                <div className="flex h-44 w-full items-end rounded-t-md bg-violet-400/[0.06]">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-violet-800 to-violet-400"
                    style={{ height: `${Math.max(day.count ? 8 : 0, (day.count / maxActivity) * 100)}%` }}
                    title={`${day.label}: ${day.count}`}
                  />
                </div>
                <time dateTime={day.key} className="text-[10px] text-slate-500">{day.label}</time>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        {t('No live Discord member totals or message activity are exposed by the current API; those values are intentionally not estimated.')}
      </p>
    </div>
  );
};
