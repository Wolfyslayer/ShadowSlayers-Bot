import React, { useState } from 'react';
import { Search } from 'lucide-react';
import type { GuildState, LogCategory } from '../../../packages/shared/src/types';

interface LoggingViewProps {
  guild: GuildState;
  onSaveLogging: (payload: { enabled: boolean; retentionDays: number }) => Promise<void>;
}

export const LoggingView: React.FC<LoggingViewProps> = ({ guild, onSaveLogging }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [retentionDays, setRetentionDays] = useState(guild.logging.retentionDays);
  const [enabled, setEnabled] = useState(guild.logging.enabled);
  const [feedback, setFeedback] = useState<string | null>(null);

  const categories = Array.from(new Set(guild.logs.map((l) => l.category)));
  const filtered = guild.logs.filter((log) => {
    const matchCat = category === 'all' || log.category === category;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      log.summary.toLowerCase().includes(q) ||
      log.actorName.toLowerCase().includes(q) ||
      (log.targetName || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">Centralized Audit & Event Logs</h2>
          <p className="text-sm text-slate-400 mt-1">
            Searchable across moderation, AutoMod, tickets, recruitment, discovery, and dashboard mutations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-amber-500" />
            <span>Enabled</span>
          </label>
          <input
            type="number"
            min={7}
            max={365}
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            className="w-20 px-2.5 py-1.5 rounded-lg bg-[#0B0D12] border border-slate-800 text-xs font-mono-tabular"
          />
          <span className="text-xs text-slate-400">days retention</span>
          <button
            type="button"
            onClick={() =>
              onSaveLogging({ enabled, retentionDays }).then(() => setFeedback('Logging configuration saved.'))
            }
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            Save Policy
          </button>
        </div>
      </div>

      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200">{feedback}</div>}

      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by actor, target, or summary..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
          >
            <option value="all">All Categories ({guild.logs.length})</option>
            {categories.map((cat: LogCategory) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2 pr-3 font-medium">Timestamp</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Actor</th>
                <th className="py-2 pr-3 font-medium">Target</th>
                <th className="py-2 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((log) => (
                <tr key={log.id} className="h-10">
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-400 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-amber-400">{log.category}</td>
                  <td className="py-2 pr-3 text-slate-200">{log.actorName}</td>
                  <td className="py-2 pr-3 text-xs text-slate-400">{log.targetName || '-'}</td>
                  <td className="py-2 text-xs text-slate-300">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
