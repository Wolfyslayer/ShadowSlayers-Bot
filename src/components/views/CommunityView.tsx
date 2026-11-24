import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import type { GuildState } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';

interface CommunityViewProps {
  guild: GuildState;
  onCreateSuggestion: (title: string, description: string) => Promise<void>;
  onVoteSuggestion: (id: string, direction: 'up' | 'down') => Promise<void>;
  onCreatePoll: (question: string, options: string[]) => Promise<void>;
  onVotePoll: (pollId: string, optionId: string) => Promise<void>;
  onCreateGiveaway: (prize: string, minutes: number) => Promise<void>;
  onCreateAnnouncement: (title: string, channelName: string, content: string, minutesDelay: number) => Promise<void>;
}

export const CommunityView: React.FC<CommunityViewProps> = ({
  guild,
  onCreateSuggestion,
  onVoteSuggestion,
  onCreatePoll,
  onVotePoll,
  onCreateGiveaway,
  onCreateAnnouncement,
}) => {
  const { locale, t } = useLocale();
  const [tab, setTab] = useState<'suggestions' | 'polls' | 'giveaways' | 'events'>('suggestions');
  const [sugTitle, setSugTitle] = useState('');
  const [sugDesc, setSugDesc] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Option A, Option B, Option C');
  const [gwPrize, setGwPrize] = useState('');
  const [gwMinutes, setGwMinutes] = useState(60);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const runAction = async (operation: Promise<void>, successMessage: string) => {
    setError(null);
    setFeedback(null);
    try {
      await operation;
      setFeedback(t(successMessage));
      return true;
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Action failed'));
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">{t('Community Engagement')}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {t('Suggestions, polls, scheduled giveaways, events, reminders, birthdays, challenges, and announcements.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 bg-[#0B0D12] p-1 rounded-lg border border-slate-800">
          {(['suggestions', 'polls', 'giveaways', 'events'] as const).map((tabName) => (
            <button
              key={tabName}
              type="button"
              onClick={() => setTab(tabName)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize cursor-pointer ${
                tab === tabName ? 'bg-[#192030] text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t(tabName)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200" role="alert">{error}</div>}
      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200" role="status">{feedback}</div>}

      {tab === 'suggestions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(onCreateSuggestion(sugTitle, sugDesc), 'Suggestion published.')
                .then((success) => { if (success) { setSugTitle(''); setSugDesc(''); } });
            }}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-slate-100">{t('Submit Suggestion')}</h3>
            <input value={sugTitle} onChange={(e) => setSugTitle(e.target.value)} required placeholder={t('Suggestion title')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <textarea rows={3} value={sugDesc} onChange={(e) => setSugDesc(e.target.value)} required placeholder={t('Describe improvement...')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              {t('Publish Suggestion')}
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#121620] p-6 divide-y divide-slate-800/70">
            {guild.suggestions.map((s) => (
              <div key={s.id} className="py-4 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">{s.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{t('By')} {s.authorName} · {t('Status')}: {t(s.status)}</p>
                  <p className="text-sm text-slate-300 mt-2">{s.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => void runAction(onVoteSuggestion(s.id, 'up'), 'Vote recorded.')} className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-[#171C28] text-xs font-mono-tabular text-emerald-300 flex items-center gap-1 cursor-pointer">
                    <ThumbsUp className="w-3.5 h-3.5" /> {s.upvotes.length}
                  </button>
                  <button type="button" onClick={() => void runAction(onVoteSuggestion(s.id, 'down'), 'Vote recorded.')} className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-[#171C28] text-xs font-mono-tabular text-red-300 flex items-center gap-1 cursor-pointer">
                    <ThumbsDown className="w-3.5 h-3.5" /> {s.downvotes.length}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'polls' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(onCreatePoll(pollQuestion, pollOptions.split(',').map((s) => s.trim()).filter(Boolean)), 'Poll created.')
                .then((success) => { if (success) setPollQuestion(''); });
            }}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-slate-100">{t('Create Poll')}</h3>
            <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} required placeholder={t('Poll question')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <input value={pollOptions} onChange={(e) => setPollOptions(e.target.value)} required placeholder={t('Comma-separated options')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              {t('Launch Poll')}
            </button>
          </form>

          <div className="lg:col-span-8 space-y-4">
            {guild.polls.map((poll) => (
              <div key={poll.id} className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-3">
                <h4 className="text-base font-semibold text-slate-100">{poll.question}</h4>
                <p className="text-xs text-slate-400">{t('Host')}: {poll.authorName} · {t('Ends')} {new Date(poll.endsAt).toLocaleString(locale === 'sv' ? 'sv-SE' : 'en-US')}</p>
                <div className="space-y-2">
                  {poll.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => void runAction(onVotePoll(poll.id, opt.id), 'Vote recorded.')}
                      className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-800 bg-[#0B0D12] hover:border-amber-500/60 text-sm cursor-pointer"
                    >
                      <span className="text-slate-200">{opt.label}</span>
                      <span className="font-mono-tabular text-xs text-amber-400">{t('{{count}} votes', { count: opt.voterIds.length })}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'giveaways' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(onCreateGiveaway(gwPrize, gwMinutes), 'Giveaway scheduled.')
                .then((success) => { if (success) setGwPrize(''); });
            }}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-slate-100">{t('Launch Giveaway')}</h3>
            <input value={gwPrize} onChange={(e) => setGwPrize(e.target.value)} required placeholder={t('Reward or title')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <input type="number" min={1} value={gwMinutes} onChange={(e) => setGwMinutes(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular" />
            <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              {t('Schedule Giveaway')}
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#121620] p-6 divide-y divide-slate-800/70">
            {guild.giveaways.map((g) => (
              <div key={g.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{g.prize}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('Host')}: {g.hostName} · {t('Entrants')}: {g.entrants.length} · {t('Ends')} {new Date(g.endsAt).toLocaleString(locale === 'sv' ? 'sv-SE' : 'en-US')}
                  </p>
                </div>
                <span className="font-mono-tabular text-xs text-amber-400">{t(g.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(onCreateAnnouncement(annTitle, 'announcements', annContent, 15), 'Announcement queued.')
                .then((success) => { if (success) { setAnnTitle(''); setAnnContent(''); } });
            }}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-slate-100">{t('Schedule Announcement')}</h3>
            <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required placeholder={t('Announcement title')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <textarea rows={3} value={annContent} onChange={(e) => setAnnContent(e.target.value)} required placeholder={t('Announcement body...')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              {t('Queue Announcement')}
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-slate-100">{t('Events, Challenges & Birthdays')}</h3>
            <div className="divide-y divide-slate-800/70">
              {guild.events.map((ev) => (
                <div key={ev.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-100">{ev.title}</span>
                    <span className="font-mono-tabular text-xs text-amber-400">{t('{{count}} RSVPs', { count: ev.rsvps.length })}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{ev.description}</p>
                </div>
              ))}
              {guild.scheduledAnnouncements.map((ann) => (
                <div key={ann.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-200">{ann.title}</span>
                    <span className="font-mono-tabular text-xs text-slate-400">{ann.sent ? t('Sent') : t('Scheduled')}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">#{ann.channelName} · {new Date(ann.scheduledFor).toLocaleString(locale === 'sv' ? 'sv-SE' : 'en-US')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
