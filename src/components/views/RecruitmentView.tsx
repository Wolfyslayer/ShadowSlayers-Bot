import React, { useState } from 'react';
import type { GuildState } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';

interface RecruitmentViewProps {
  guild: GuildState;
  onSubmitApplication: (formId: string, answers: Record<string, string>) => Promise<void>;
  onReviewApplication: (appId: string, status: 'approved' | 'rejected', notes: string) => Promise<void>;
}

export const RecruitmentView: React.FC<RecruitmentViewProps> = ({
  guild,
  onSubmitApplication,
  onReviewApplication,
}) => {
  const { t } = useLocale();
  const [selectedFormId, setSelectedFormId] = useState(guild.recruitmentForms[0]?.id || 'form-clan');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState('Reviewed by Shadow Council.');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedForm = guild.recruitmentForms.find((f) => f.id === selectedFormId) ?? guild.recruitmentForms[0];

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForm) return;
    setError(null);
    setFeedback(null);
    try {
      await onSubmitApplication(selectedForm.id, answers);
      setAnswers({});
      setFeedback(t('Application submitted to recruitment review queue.'));
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Submission failed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
        <h2 className="font-display text-xl font-semibold text-slate-100">{t('Recruitment & Applications')}</h2>
        <p className="text-sm text-slate-400 mt-1">
          {t('Configurable clan, staff, and event recruitment forms with reviewer attribution and audit history.')}
        </p>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200" role="alert">{error}</div>}
      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200" role="status">{feedback}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleApply} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">{t('Application Form Preview & Submit')}</h3>
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('Recruitment Form')}</label>
            <select
              value={selectedFormId}
              onChange={(e) => {
                setSelectedFormId(e.target.value);
                setAnswers({});
              }}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
            >
              {guild.recruitmentForms.map((f) => (
                <option key={f.id} value={f.id}>{f.title} ({t(f.category)})</option>
              ))}
            </select>
          </div>
          {selectedForm && (
            <>
              <p className="text-xs text-slate-400">{selectedForm.description} · {t('Target role')}: {selectedForm.targetRoleName}</p>
              {selectedForm.fields.map((field) => (
                <div key={field.id}>
                  <label className="block text-xs text-slate-300 mb-1">{field.label}</label>
                  {field.type === 'select' && field.options ? (
                    <select
                      value={answers[field.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                      required={field.required}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm"
                    >
                      <option value="">{t('Select option...')}</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'long_text' ? (
                    <textarea
                      rows={2}
                      value={answers[field.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                      required={field.required}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm"
                    />
                  ) : (
                    <input
                      value={answers[field.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                      required={field.required}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm"
                    />
                  )}
                </div>
              ))}
              <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
                {t('Submit Application')}
              </button>
            </>
          )}
        </form>

        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-slate-100">
              {t('Review Queue')} ({guild.recruitmentApplications.length})
            </h3>
            <input
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder={t('Reviewer decision notes...')}
              className="px-3 py-1.5 rounded-lg bg-[#0B0D12] border border-slate-800 text-xs text-slate-200"
            />
          </div>

          <div className="divide-y divide-slate-800/70">
            {guild.recruitmentApplications.map((app) => (
              <div key={app.id} className="py-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-100">
                    {app.applicantUsername} ·                     <span className="text-amber-400">{t(app.category)}</span>
                  </span>
                  <span className="font-mono-tabular text-xs text-slate-400">{t(app.status)}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300 bg-[#0B0D12] p-3 rounded-lg border border-slate-800">
                  {Object.entries(app.answers).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-slate-500">{k}: </span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
                {app.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onReviewApplication(app.id, 'approved', reviewNotes).catch((err) => setError(err instanceof Error ? t(err.message) : t('Review failed')))}
                      className="px-3 py-1.5 rounded bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs cursor-pointer"
                    >
                      {t('Approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReviewApplication(app.id, 'rejected', reviewNotes).catch((err) => setError(err instanceof Error ? t(err.message) : t('Review failed')))}
                      className="px-3 py-1.5 rounded bg-red-950/50 border border-red-500/40 text-red-300 text-xs cursor-pointer"
                    >
                      {t('Reject')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {t('Reviewed by')} {app.reviewerUsername} · {app.reviewNotes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
