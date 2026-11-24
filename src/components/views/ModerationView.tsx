import React, { useState } from 'react';
import { Gavel } from 'lucide-react';
import type { GuildState, ModerationActionType } from '../../../packages/shared/src/types';

interface ModerationViewProps {
  guild: GuildState;
  onExecuteModeration: (payload: {
    action: ModerationActionType;
    targetUserId: string;
    targetUsername: string;
    reason: string;
    durationMinutes: number | null;
  }) => Promise<void>;
  onReviewAppeal: (appealId: string, status: 'approved' | 'rejected', notes: string) => Promise<void>;
}

export const ModerationView: React.FC<ModerationViewProps> = ({
  guild,
  onExecuteModeration,
  onReviewAppeal,
}) => {
  const [action, setAction] = useState<ModerationActionType>('warn');
  const [targetUserId, setTargetUserId] = useState(guild.members[guild.members.length - 1]?.userId || 'u-106');
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [reviewNotes, setReviewNotes] = useState('Reviewed by Shadow Council.');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    const target = guild.members.find((m) => m.userId === targetUserId);
    try {
      await onExecuteModeration({
        action,
        targetUserId,
        targetUsername: target?.username || targetUserId,
        reason,
        durationMinutes: action === 'timeout' || action === 'tempban' ? durationMinutes : null,
      });
      setReason('');
      setFeedback(`Moderation action "${action}" recorded and logged.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Moderation failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
        <h2 className="font-display text-xl font-semibold text-slate-100">Moderation Cases & Appeals</h2>
        <p className="text-sm text-slate-400 mt-1">
          Every action assigns a unique sequential case ID, validates clan rank hierarchy, and persists temporary expiration tasks.
        </p>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200">{error}</div>}
      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200">{feedback}</div>}

      {/* Execute Action Form */}
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
          <Gavel className="w-4 h-4" />
          <span>Issue Hierarchy-Checked Moderation Action</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as ModerationActionType)}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
            >
              <option value="warn">/warn</option>
              <option value="timeout">/timeout</option>
              <option value="untimeout">/untimeout</option>
              <option value="kick">/kick</option>
              <option value="tempban">/tempban</option>
              <option value="ban">/ban</option>
              <option value="unban">/unban</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target Member</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
            >
              {guild.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.username} ({m.clanRank})
                </option>
              ))}
            </select>
          </div>
          {(action === 'timeout' || action === 'tempban') && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Duration (minutes)</label>
              <input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100 font-mono-tabular"
              />
            </div>
          )}
          <div className={action === 'timeout' || action === 'tempban' ? 'sm:col-span-1' : 'sm:col-span-2'}>
            <label className="block text-xs text-slate-400 mb-1">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={2}
              placeholder="Document clear reason..."
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer"
          >
            Execute Moderation Case
          </button>
        </div>
      </form>

      {/* Cases & Appeals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#121620] p-6 overflow-x-auto">
          <h3 className="font-display text-lg font-semibold text-slate-100 mb-4">
            Moderation Cases ({guild.moderationCases.length})
          </h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2 pr-3 font-medium">Case ID</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Target</th>
                <th className="py-2 pr-3 font-medium">Discord</th>
                <th className="py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {guild.moderationCases.map((c) => (
                <tr key={c.caseId} className="h-10">
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-amber-400">{c.caseId}</td>
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-200">{c.action}</td>
                  <td className="py-2 pr-3 text-slate-200">{c.targetUsername}</td>
                  <td className="py-2 pr-3 font-mono-tabular text-xs">
                    <span
                      className={
                        c.discordExecutionStatus === 'verified_live'
                          ? 'text-emerald-400'
                          : c.discordExecutionStatus === 'failed'
                            ? 'text-red-400'
                            : 'text-slate-400'
                      }
                      title={c.discordError || undefined}
                    >
                      {c.discordExecutionStatus}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-slate-300">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">
            Appeals Queue ({guild.appeals.length})
          </h3>
          <input
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Council review note..."
            className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-xs text-slate-200"
          />
          <div className="divide-y divide-slate-800/70">
            {guild.appeals.map((appeal) => (
              <div key={appeal.id} className="py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono-tabular text-amber-400">
                    {appeal.caseId} · {appeal.username}
                  </span>
                  <span className="text-slate-400">{appeal.status}</span>
                </div>
                <p className="text-sm text-slate-300">{appeal.reason}</p>
                {appeal.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onReviewAppeal(appeal.id, 'approved', reviewNotes).catch((err) => setError(err.message))}
                      className="px-3 py-1 rounded bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onReviewAppeal(appeal.id, 'rejected', reviewNotes).catch((err) => setError(err.message))}
                      className="px-3 py-1 rounded bg-red-950/50 border border-red-500/40 text-red-300 text-xs cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
