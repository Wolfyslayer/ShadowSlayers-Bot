import React, { useState } from 'react';
import { Gavel } from 'lucide-react';
import type { GuildState, ModerationActionType } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';
import { ConfirmationDialog } from '../ui/DashboardPrimitives';

type ModerationPayload = {
  action: ModerationActionType;
  targetUserId: string;
  targetUsername: string;
  reason: string;
  durationMinutes: number | null;
};

interface ModerationViewProps {
  guild: GuildState;
  onExecuteModeration: (payload: ModerationPayload) => Promise<void>;
  onReviewAppeal: (appealId: string, status: 'approved' | 'rejected', notes: string) => Promise<void>;
}

export const ModerationView: React.FC<ModerationViewProps> = ({
  guild,
  onExecuteModeration,
  onReviewAppeal,
}) => {
  const { t } = useLocale();
  const [action, setAction] = useState<ModerationActionType>('warn');
  const [targetUserId, setTargetUserId] = useState(guild.members[guild.members.length - 1]?.userId || 'u-106');
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [reviewNotes, setReviewNotes] = useState('Reviewed by Shadow Council.');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ModerationPayload | null>(null);

  const executeAction = async (payload: ModerationPayload) => {
    setError(null);
    setFeedback(null);
    try {
      await onExecuteModeration(payload);
      setReason('');
      setFeedback(t('Moderation action "{{action}}" verified on Discord and logged.', { action: t(payload.action) }));
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Moderation failed'));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = guild.members.find((m) => m.userId === targetUserId);
    const payload: ModerationPayload = {
      action,
      targetUserId,
      targetUsername: target?.username || targetUserId,
      reason,
      durationMinutes: action === 'timeout' || action === 'tempban' ? durationMinutes : null,
    };
    if (action === 'ban' || action === 'tempban' || action === 'kick' || action === 'purge') {
      setPendingAction(payload);
      return;
    }
    void executeAction(payload);
  };

  return (
    <div className="space-y-6">
      <ConfirmationDialog
        open={pendingAction !== null}
        title={t('Confirm destructive action')}
        description={t('Confirm moderation action "{{action}}" on {{username}}?', {
          action: pendingAction ? t(pendingAction.action) : '',
          username: pendingAction?.targetUsername ?? '',
        })}
        confirmLabel={t('Confirm')}
        cancelLabel={t('Cancel')}
        danger
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) void executeAction(pendingAction);
          setPendingAction(null);
        }}
      />
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
        <h2 className="font-display text-xl font-semibold text-slate-100">{t('Moderation Cases & Appeals')}</h2>
        <p className="text-sm text-slate-400 mt-1">
          {t('Every action assigns a unique sequential case ID, validates clan rank hierarchy, and persists temporary expiration tasks.')}
        </p>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200" role="alert">{error}</div>}
      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200" role="status">{feedback}</div>}

      {/* Execute Action Form */}
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
          <Gavel className="w-4 h-4" />
          <span>{t('Issue Hierarchy-Checked Moderation Action')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('Action')}</label>
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
            <label className="block text-xs text-slate-400 mb-1">{t('Target Member')}</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
            >
              {guild.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.username} ({m.clanRank ? t(m.clanRank) : t('Unranked')})
                </option>
              ))}
            </select>
          </div>
          {(action === 'timeout' || action === 'tempban') && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('Duration (minutes)')}</label>
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
            <label className="block text-xs text-slate-400 mb-1">{t('Reason')}</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={2}
              placeholder={t('Document clear reason...')}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer"
          >
            {t('Execute Moderation Case')}
          </button>
        </div>
      </form>

      {/* Cases & Appeals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#121620] p-6 overflow-x-auto">
          <h3 className="font-display text-lg font-semibold text-slate-100 mb-4">
            {t('Moderation Cases')} ({guild.moderationCases.length})
          </h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2 pr-3 font-medium">{t('Case ID')}</th>
                <th className="py-2 pr-3 font-medium">{t('Action')}</th>
                <th className="py-2 pr-3 font-medium">{t('Target')}</th>
                <th className="py-2 pr-3 font-medium">{t('Discord')}</th>
                <th className="py-2 font-medium">{t('Reason')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {guild.moderationCases.map((c) => (
                <tr key={c.caseId} className="h-10">
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-amber-400">{c.caseId}</td>
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-200">                  {t(c.action)}</td>
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
                      {t(c.discordExecutionStatus)}
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
            {t('Appeals Queue')} ({guild.appeals.length})
          </h3>
          <input
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder={t('Council review note...')}
            className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-xs text-slate-200"
          />
          <div className="divide-y divide-slate-800/70">
            {guild.appeals.map((appeal) => (
              <div key={appeal.id} className="py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono-tabular text-amber-400">
                    {appeal.caseId} · {appeal.username}
                  </span>
                  <span className="text-slate-400">{t(appeal.status)}</span>
                </div>
                <p className="text-sm text-slate-300">{appeal.reason}</p>
                {appeal.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onReviewAppeal(appeal.id, 'approved', reviewNotes).catch((err) => setError(err instanceof Error ? t(err.message) : t('Review failed')))}
                      className="px-3 py-1 rounded bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs cursor-pointer"
                    >
                      {t('Approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReviewAppeal(appeal.id, 'rejected', reviewNotes).catch((err) => setError(err instanceof Error ? t(err.message) : t('Review failed')))}
                      className="px-3 py-1 rounded bg-red-950/50 border border-red-500/40 text-red-300 text-xs cursor-pointer"
                    >
                      {t('Reject')}
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
