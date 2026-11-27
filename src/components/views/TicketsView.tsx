import React, { useState } from 'react';
import { Plus, Send } from 'lucide-react';
import type { GuildState, TicketRecord } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';
import { ConfirmationDialog } from '../ui/DashboardPrimitives';

interface TicketsViewProps {
  guild: GuildState;
  onCreateTicket: (payload: {
    category: TicketRecord['category'];
    subject: string;
    initialMessage: string;
  }) => Promise<void>;
  onSendMessage: (ticketId: string, content: string) => Promise<void>;
  onTicketAction: (
    ticketId: string,
    action: 'claim' | 'transfer' | 'close' | 'reopen' | 'feedback',
  ) => Promise<void>;
}

export const TicketsView: React.FC<TicketsViewProps> = ({
  guild,
  onCreateTicket,
  onSendMessage,
  onTicketAction,
}) => {
  const { locale, t } = useLocale();
  const [selectedId, setSelectedId] = useState(guild.tickets[0]?.id || '');
  const [showNew, setShowNew] = useState(false);
  const [category, setCategory] = useState<TicketRecord['category']>('general_support');
  const [subject, setSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [reply, setReply] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [closingTicketId, setClosingTicketId] = useState<string | null>(null);

  const filtered = guild.tickets.filter((t) => {
    if (statusFilter === 'open') return t.status !== 'closed';
    if (statusFilter === 'closed') return t.status === 'closed';
    return true;
  });

  const selected = guild.tickets.find((t) => t.id === selectedId) ?? filtered[0];
  const ticketPendingClose = guild.tickets.find((ticket) => ticket.id === closingTicketId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await onCreateTicket({ category, subject, initialMessage });
      setSubject('');
      setInitialMessage('');
      setShowNew(false);
      setFeedback(t('Ticket saved in the dashboard.'));
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Ticket creation failed'));
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setError(null);
    setFeedback(null);
    try {
      await onSendMessage(selected.id, reply.trim());
      setReply('');
      setFeedback(t('Reply sent.'));
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Message failed'));
    }
  };
  const runTicketAction = async (ticketId: string, action: 'claim' | 'transfer' | 'close' | 'reopen' | 'feedback') => {
    setError(null);
    setFeedback(null);
    try {
      await onTicketAction(ticketId, action);
      setFeedback(t('Ticket updated.'));
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Ticket action failed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">{t('Support Tickets & Transcripts')}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {t('Sequential private tickets with claim, transfer, close/reopen, feedback, and staff-isolated transcripts.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{t('New Ticket')}</span>
        </button>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200" role="alert">{error}</div>}
      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200" role="status">{feedback}</div>}
      <ConfirmationDialog
        open={Boolean(ticketPendingClose)}
        title={t('Confirm ticket closure')}
        description={t('Close ticket #{{number}}: {{subject}}? This archives the ticket and its transcript.', {
          number: ticketPendingClose?.ticketNumber ?? '',
          subject: ticketPendingClose?.subject ?? '',
        })}
        confirmLabel={t('Close & Archive')}
        cancelLabel={t('Cancel')}
        danger
        onCancel={() => setClosingTicketId(null)}
        onConfirm={() => {
          if (closingTicketId) void runTicketAction(closingTicketId, 'close');
          setClosingTicketId(null);
        }}
      />

      {showNew && (
        <form onSubmit={handleCreate} className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('Category')}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as TicketRecord['category'])} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm">
                <option value="general_support">{t('General Support')}</option>
                <option value="clan_issue">{t('Clan Issue')}</option>
                <option value="ban_appeal">{t('Ban Appeal')}</option>
                <option value="language_help">{t('Language Help')}</option>
                <option value="report">{t('Member Report')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('Subject')}</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('Initial Details')}</label>
            <textarea rows={3} value={initialMessage} onChange={(e) => setInitialMessage(e.target.value)} required className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 cursor-pointer">{t('Cancel')}</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">{t('Open Ticket')}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-slate-100">{t('Queue')} ({filtered.length})</h3>
            <div className="flex gap-1 bg-[#0B0D12] p-1 rounded-lg border border-slate-800">
              {(['all', 'open', 'closed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded text-xs capitalize cursor-pointer ${
                    statusFilter === st ? 'bg-[#192030] text-amber-300' : 'text-slate-400'
                  }`}
                >
                  {t(st)}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-800/70">
            {filtered.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedId(ticket.id)}
                className={`w-full text-left py-3 px-2 rounded transition-colors cursor-pointer ${
                  selected?.id === ticket.id ? 'bg-[#192030]' : 'hover:bg-[#161B26]'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono-tabular text-amber-400">#{ticket.ticketNumber} · {t(ticket.category)}</span>
                  <span className="text-slate-400">{t(ticket.status)}</span>
                </div>
                <p className="text-sm font-medium text-slate-100 mt-1">{ticket.subject}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('Creator')}: {ticket.creatorUsername}{ticket.claimedByUsername ? ` · ${t('Staff')}: ${ticket.claimedByUsername}` : ''}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-100">
                    Ticket #{selected.ticketNumber}: {selected.subject}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('Channel')}: #{selected.channelName} · {t('Status')}: {t(selected.status)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.status === 'open' && (
                    <button type="button" onClick={() => void runTicketAction(selected.id, 'claim')} className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#171C28] text-xs text-slate-200 cursor-pointer">
                      {t('Claim')}
                    </button>
                  )}
                  {selected.status !== 'closed' ? (
                    <>
                      <button type="button" onClick={() => void runTicketAction(selected.id, 'transfer')} className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#171C28] text-xs text-slate-200 cursor-pointer">
                        {t('Transfer')}
                      </button>
                      <button type="button" onClick={() => setClosingTicketId(selected.id)} className="px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-950/30 text-xs text-red-200 cursor-pointer">
                        {t('Close & Archive')}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => void runTicketAction(selected.id, 'reopen')} className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-950/30 text-xs text-amber-200 cursor-pointer">
                      {t('Reopen')}
                    </button>
                  )}
                </div>
              </div>

              {/* Transcript Messages */}
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {selected.messages.map((msg) => (
                  <div key={msg.id} className="p-3.5 rounded-lg bg-[#0B0D12] border border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-medium text-slate-200">{msg.authorName} · {msg.authorRole}</span>
                      <span className="font-mono-tabular">{new Date(msg.createdAt).toLocaleString(locale === 'sv' ? 'sv-SE' : 'en-US')}</span>
                    </div>
                    <p className="text-sm text-slate-300">{msg.content}</p>
                  </div>
                ))}
              </div>

              {selected.status !== 'closed' && (
                <form onSubmit={handleReply} className="flex gap-2 pt-2 border-t border-slate-800">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={t('Write transcript reply...')}
                    className="flex-1 px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
                  />
                  <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm flex items-center gap-1.5 cursor-pointer">
                    <Send className="w-4 h-4" />
                    <span>{t('Send')}</span>
                  </button>
                </form>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">{t('Select a ticket to inspect its transcript.')}</p>
          )}
        </div>
      </div>
    </div>
  );
};
