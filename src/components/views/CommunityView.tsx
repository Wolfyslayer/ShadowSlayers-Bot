import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import type { GuildState } from '../../../packages/shared/src/types';

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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">Community Engagement</h2>
          <p className="text-sm text-slate-400 mt-1">
            Suggestions, polls, scheduled giveaways, events, reminders, birthdays, challenges, and announcements.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 bg-[#0B0D12] p-1 rounded-lg border border-slate-800">
          {(['suggestions', 'polls', 'giveaways', 'events'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize cursor-pointer ${
                tab === t ? 'bg-[#192030] text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200">{error}</div>}

      {tab === 'suggestions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreateSuggestion(sugTitle, sugDesc)
                .then(() => { setSugTitle(''); setSugDesc(''); })
                .catch((err) => setError(err.message));
            }}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-slate-100">Submit Suggestion</h3>
            <input value={sugTitle} onChange={(e) => setSugTitle(e.target.value)} required placeholder="Suggestion title" className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <textarea rows={3} value={sugDesc} onChange={(e) => setSugDesc(e.target.value)} required placeholder="Describe improvement..." className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              Publish Suggestion
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#121620] p-6 divide-y divide-slate-800/70">
            {guild.suggestions.map((s) => (
              <div key={s.id} className="py-4 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">{s.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">By {s.authorName} · Status: {s.status}</p>
                  <p className="text-sm text-slate-300 mt-2">{s.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => onVoteSuggestion(s.id, 'up')} className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-[#171C28] text-xs font-mono-tabular text-emerald-300 flex items-center gap-1 cursor-pointer">
                    <ThumbsUp className="w-3.5 h-3.5" /> {s.upvotes.length}
                  </button>
                  <button type="button" onClick={() => onVoteSuggestion(s.id, 'down')} className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-[#171C28] text-xs font-mono-tabular text-red-300 flex items-center gap-1 cursor-pointer">
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
              onCreatePoll(pollQuestion, pollOptions.split(',').map((s) => s.trim()).filter(Boolean))
                .then(() => setPollQuestion(''))
                .catch((err) => setError(err.message));
            }}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-slate-100">Create Poll</h3>
            <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} required placeholder="Poll question" className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <input value={pollOptions} onChange={(e) => setPollOptions(e.target.value)} required placeholder="Comma-separated options" className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              Launch Poll
            </button>
          </form>

          <div className="lg:col-span-8 space-y-4">
            {guild.polls.map((poll) => (
              <div key={poll.id} className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-3">
                <h4 className="text-base font-semibold text-slate-100">{poll.question}</h4>
                <p className="text-xs text-slate-400">Host: {poll.authorName} · Ends {new Date(poll.endsAt).toLocaleString()}</p>
                <div className="space-y-2">
                  {poll.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onVotePoll(poll.id, opt.id)}
                      className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-800 bg-[#0B0D12] hover:border-amber-500/60 text-sm cursor-pointer"
                    >
                      <span className="text-slate-200">{opt.label}</span>
                      <span className="font-mono-tabular text-xs text-amber-400">{opt.voterIds.length} votes</span>
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
              onCreateGiveaway(gwPrize, gwMinutes)
                .then(() => setGwPrize(''))
                .catch((err) => setError(err.message));
            }}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-slate-100">Launch Giveaway</h3>
            <input value={gwPrize} onChange={(e) => setGwPrize(e.target.value)} required placeholder="Reward or title" className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <input type="number" min={1} value={gwMinutes} onChange={(e) => setGwMinutes(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular" />
            <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              Schedule Giveaway
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#121620] p-6 divide-y divide-slate-800/70">
            {guild.giveaways.map((g) => (
              <div key={g.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{g.prize}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Host: {g.hostName} · Entrants: {g.entrants.length} · Ends {new Date(g.endsAt).toLocaleString()}
                  </p>
                </div>
                <span className="font-mono-tabular text-xs text-amber-400">{g.status}</span>
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
              onCreateAnnouncement(annTitle, 'announcements', annContent, 15)
                .then(() => { setAnnTitle(''); setAnnContent(''); })
                .catch((err) => setError(err.message));
            }}
            className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-slate-100">Schedule Announcement</h3>
            <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required placeholder="Announcement title" className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <textarea rows={3} value={annContent} onChange={(e) => setAnnContent(e.target.value)} required placeholder="Announcement body..." className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <button type="submit" className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              Queue Announcement
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-slate-100">Events, Challenges & Birthdays</h3>
            <div className="divide-y divide-slate-800/70">
              {guild.events.map((ev) => (
                <div key={ev.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-100">{ev.title}</span>
                    <span className="font-mono-tabular text-xs text-amber-400">{ev.rsvps.length} RSVPs</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{ev.description}</p>
                </div>
              ))}
              {guild.scheduledAnnouncements.map((ann) => (
                <div key={ann.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-200">{ann.title}</span>
                    <span className="font-mono-tabular text-xs text-slate-400">{ann.sent ? 'Sent' : 'Scheduled'}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">#{ann.channelName} · {new Date(ann.scheduledFor).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
