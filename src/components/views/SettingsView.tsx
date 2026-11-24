import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { getRankHierarchyTable } from '../../../packages/permissions/src/hierarchy';
import type { GuildModulesConfig, GuildState } from '../../../packages/shared/src/types';

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
  const [modules, setModules] = useState<GuildModulesConfig>(guild.modules);
  const [feedback, setFeedback] = useState<string | null>(null);
  const hierarchy = getRankHierarchyTable();

  const toggleModule = async (key: keyof GuildModulesConfig) => {
    const next = { ...modules, [key]: !modules[key] };
    setModules(next);
    await onSaveSettings({ modules: next });
    setFeedback(`Module "${key}" ${next[key] ? 'enabled' : 'disabled'}.`);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">System Settings, RBAC & Hosting</h2>
          <p className="text-sm text-slate-400 mt-1">
            Module toggles, clan hierarchy permissions, database adapter state, and encrypted-free JSON snapshot export.
          </p>
        </div>
        <button
          type="button"
          onClick={onDownloadBackup}
          className="px-4 py-2 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] text-sm font-medium text-slate-200 flex items-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Export Backup JSON</span>
        </button>
      </div>

      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200">{feedback}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Modules */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">Platform Modules</h3>
          <div className="divide-y divide-slate-800/70">
            {(Object.keys(modules) as (keyof GuildModulesConfig)[]).map((key) => (
              <label key={key} className="py-2.5 flex items-center justify-between cursor-pointer">
                <span className="text-sm capitalize text-slate-200">{key}</span>
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
            <h3 className="font-display text-lg font-semibold text-slate-100 mb-3">Clan Rank Permission Matrix</h3>
            <div className="divide-y divide-slate-800/70">
              {hierarchy.map((row) => (
                <div key={row.rank} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-amber-300">{row.rank}</span>
                    <span className="font-mono-tabular text-xs text-slate-400">Weight {row.weight}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{row.capabilities.join(' · ')}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-2 text-xs text-slate-300">
            <h3 className="font-display text-base font-semibold text-slate-100">Hosting & Security Posture</h3>
            <p>Active Database Adapter: <span className="font-mono-tabular text-amber-400">{databaseAdapter}</span></p>
            <p>Dashboard API Origin: <span className="font-mono-tabular text-slate-200">{import.meta.env.VITE_API_BASE_URL || 'Not configured'}</span></p>
            <p>Bot Architecture: Single centralized Discord Gateway client in <span className="font-mono-tabular">apps/bot/src/index.ts</span></p>
            <p>AI Functionality: Disabled by design (0% AI dependencies)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
