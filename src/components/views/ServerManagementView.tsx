import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, Lock } from 'lucide-react';
import type { GuildState } from '../../../packages/shared/src/types';

interface ServerManagementViewProps {
  guild: GuildState;
  onRescan: () => Promise<void>;
  onConfirmSetup: () => Promise<void>;
}

export const ServerManagementView: React.FC<ServerManagementViewProps> = ({
  guild,
  onRescan,
  onConfirmSetup,
}) => {
  const [explicitConfirm, setExplicitConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const pendingChanges = guild.discovery.proposedChanges.filter((c) => !c.applied);

  const handleRescan = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await onRescan();
      setFeedback('Server structure rescanned non-destructively.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Rescan failed');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!explicitConfirm) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onConfirmSetup();
      setExplicitConfirm(false);
      setFeedback('Additive setup changes confirmed and mapped.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Non-Destructive Server Discovery
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Last scanned: <span className="font-mono-tabular text-slate-300">{new Date(guild.discovery.lastDiscoveredAt).toLocaleString()}</span> · Existing roles and permissions are never overwritten or deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRescan}
          disabled={busy}
          className="px-4 py-2 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] text-sm font-medium text-slate-200 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Run Discovery Scan</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-950/20 text-amber-200 text-sm">
          {feedback}
        </div>
      )}

      {/* Proposed Setup Diff Preview */}
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-100">Proposed Setup Operations</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Additive mapping preview ({pendingChanges.length} pending, {guild.discovery.proposedChanges.length - pendingChanges.length} mapped)
            </p>
          </div>
          {guild.discovery.setupConfirmedAt && (
            <span className="text-xs text-emerald-400 font-mono-tabular">
              Confirmed by {guild.discovery.setupConfirmedBy}
            </span>
          )}
        </div>

        <div className="divide-y divide-slate-800/80">
          {guild.discovery.proposedChanges.map((change) => (
            <div key={change.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-200">{change.targetName}</p>
                <p className="text-xs text-slate-400 mt-0.5">{change.kind} · {change.reason}</p>
              </div>
              <span className={`text-xs font-mono-tabular ${change.applied ? 'text-emerald-400' : 'text-amber-400'}`}>
                {change.applied ? 'Mapped / Applied' : 'Awaiting Confirmation'}
              </span>
            </div>
          ))}
        </div>

        {pendingChanges.length > 0 && (
          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={explicitConfirm}
                onChange={(e) => setExplicitConfirm(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded"
              />
              <span>I confirm these additive, non-destructive setup actions only (no roles deleted/renamed).</span>
            </label>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!explicitConfirm || busy}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-semibold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply Approved Changes</span>
            </button>
          </div>
        )}
      </div>

      {/* Categories & Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
          <h3 className="font-display text-lg font-semibold text-slate-100 mb-4">
            Discovered Categories & Channels ({guild.discovery.categories.length})
          </h3>
          <div className="space-y-4">
            {guild.discovery.categories.map((cat) => (
              <div key={cat.id} className="pb-3 border-b border-slate-800/70 last:border-none">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">{cat.name}</span>
                    {cat.isPrivateLeadership && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                        <Lock className="w-3 h-3" /> Leadership Only
                      </span>
                    )}
                  </div>
                  <span className="font-mono-tabular text-xs text-slate-500">
                    {cat.channels.length} channels
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                  {cat.channels.map((ch) => (
                    <span key={ch.id} className="font-mono-tabular">
                      #{ch.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Discovered Roles */}
        <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
          <h3 className="font-display text-lg font-semibold text-slate-100 mb-4">
            Discovered Role Hierarchy ({guild.discovery.roles.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-2 pr-3 font-medium">Role Name</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium text-right">Rank Weight</th>
                  <th className="py-2 font-medium text-right">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {guild.discovery.roles.map((role) => (
                  <tr key={role.id} className="h-10">
                    <td className="py-2 pr-3 text-slate-200 font-medium">{role.name}</td>
                    <td className="py-2 pr-3 text-xs text-slate-400">{role.category}</td>
                    <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-300 text-right">
                      {role.rankOrder}
                    </td>
                    <td className="py-2 text-xs text-right text-slate-400">
                      {role.discoveredFromExisting ? 'Existing' : 'Addon'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
