import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { getRankHierarchyTable } from '../../../packages/permissions/src/hierarchy';
import type { GuildModulesConfig, GuildState } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';

interface SettingsViewProps {
  guild: GuildState;
  databaseAdapter: string;
  onSaveSettings: (patch: { modules?: GuildModulesConfig }) => Promise<void>;
  onDownloadBackup: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  guild,
  databaseAdapter,
  onSaveSettings,
  onDownloadBackup,
}) => {
  const { t } = useLocale();
  const [modules, setModules] = useState<GuildModulesConfig>(guild.modules);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hierarchy = getRankHierarchyTable();

  const toggleModule = async (key: keyof GuildModulesConfig) => {
    const next = { ...modules, [key]: !modules[key] };
    setError(null);
    setFeedback(null);
    try {
      await onSaveSettings({ modules: next });
      setModules(next);
      setFeedback(t('Module "{{module}}" {{state}}.', { module: t(key), state: next[key] ? t('enabled') : t('disabled') }));
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Save failed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">{t('System Settings, RBAC & Hosting')}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {t('Module toggles, clan hierarchy permissions, database adapter state, and encrypted-free JSON snapshot export.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            onDownloadBackup().catch((err) => setError(err instanceof Error ? t(err.message) : t('Backup export failed')));
          }}
          className="px-4 py-2 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] text-sm font-medium text-slate-200 flex items-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>{t('Export Backup JSON')}</span>
        </button>
      </div>

      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200">{feedback}</div>}
      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200" role="alert">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Modules */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">{t('Platform Modules')}</h3>
          <div className="divide-y divide-slate-800/70">
            {(Object.keys(modules) as (keyof GuildModulesConfig)[]).map((key) => (
              <label key={key} className="py-2.5 flex items-center justify-between cursor-pointer">
                <span className="text-sm capitalize text-slate-200">{t(key)}</span>
                <input
                  type="checkbox"
                  checked={modules[key]}
                  onChange={() => void toggleModule(key)}
                  className="w-4 h-4 accent-amber-500"
                />
              </label>
            ))}
          </div>
        </div>

        {/* RBAC & Hosting Info */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
            <h3 className="font-display text-lg font-semibold text-slate-100 mb-3">{t('Clan Rank Permission Matrix')}</h3>
            <div className="divide-y divide-slate-800/70">
              {hierarchy.map((row) => (
                <div key={row.rank} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-amber-300">{t(row.rank)}</span>
                    <span className="font-mono-tabular text-xs text-slate-400">{t('Weight')} {row.weight}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{row.capabilities.join(' · ')}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-2 text-xs text-slate-300">
            <h3 className="font-display text-base font-semibold text-slate-100">{t('Hosting & Security Posture')}</h3>
            <p>{t('Active Database Adapter:')} <span className="font-mono-tabular text-amber-400">{databaseAdapter}</span></p>
            <p>{t('Dashboard API Origin:')} <span className="font-mono-tabular text-slate-200">{import.meta.env.VITE_API_BASE_URL || t('Not configured')}</span></p>
            <p>{t('Bot Architecture: Single centralized Discord Gateway client in')} <span className="font-mono-tabular">apps/bot/src/index.ts</span></p>
            <p>{t('AI Functionality: Disabled by design (0% AI dependencies)')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
