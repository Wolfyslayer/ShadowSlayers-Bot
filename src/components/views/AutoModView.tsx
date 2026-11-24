import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { AutoModConfig, GuildState } from '../../../packages/shared/src/types';

interface AutoModViewProps {
  guild: GuildState;
  onSaveAutoMod: (config: AutoModConfig) => Promise<void>;
  onTestAutoMod: (payload: { content: string; channelName: string; mentionCount: number }) => Promise<{
    triggered: boolean;
    exempt: boolean;
    ruleHits: string[];
    recommendedActions: string[];
    reason: string | null;
  }>;
  onReportFalsePositive: (payload: {
    channelName: string;
    sampleContent: string;
    ruleHits: string[];
    notes: string;
  }) => Promise<void>;
  onResolveFalsePositive: (reportId: string, status: 'resolved' | 'dismissed') => Promise<void>;
}

export const AutoModView: React.FC<AutoModViewProps> = ({
  guild,
  onSaveAutoMod,
  onTestAutoMod,
  onReportFalsePositive,
  onResolveFalsePositive,
}) => {
  const [cfg, setCfg] = useState<AutoModConfig>(guild.automod);
  const [testContent, setTestContent] = useState('Join my server discord.gg/example-invite');
  const [testChannel, setTestChannel] = useState('💬・general-chat');
  const [testMentions, setTestMentions] = useState(0);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [fpRule, setFpRule] = useState('suspicious_link');
  const [fpNotes, setFpNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await onSaveAutoMod(cfg);
      setFeedback('Rule-based AutoMod configuration saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleSimulate = async () => {
    setError(null);
    try {
      const res = await onTestAutoMod({
        content: testContent,
        channelName: testChannel,
        mentionCount: testMentions,
      });
      setTestResult(
        res.exempt
          ? 'Exempt channel/role — passed without action.'
          : res.triggered
            ? `Triggered: ${res.ruleHits.join(', ')} -> Actions: ${res.recommendedActions.join(', ')}`
            : 'Clean message — no AutoMod rules triggered.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    }
  };

  const handleReportFp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await onReportFalsePositive({
        channelName: testChannel,
        sampleContent: testContent,
        ruleHits: fpRule.split(',').map((s) => s.trim()).filter(Boolean),
        notes: fpNotes || 'Flagged via dashboard AutoMod reviewer.',
      });
      setFpNotes('');
      setFeedback('False-positive report logged for moderator review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">Rule-Based AutoMod & Security</h2>
          <p className="text-sm text-slate-400 mt-1">
            Deterministic spam, link, invite, mention, and raid filters. Automated rules never issue permanent bans.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = { ...cfg, emergencyLockdown: !cfg.emergencyLockdown };
            setCfg(next);
            void onSaveAutoMod(next);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border cursor-pointer whitespace-nowrap shrink-0 ${
            cfg.emergencyLockdown
              ? 'bg-red-600 border-red-500 text-white'
              : 'bg-[#171C28] border-slate-700 text-slate-200 hover:border-red-500/60'
          }`}
        >
          <ShieldAlert className="w-4 h-4 inline mr-1.5" />
          {cfg.emergencyLockdown ? 'Emergency Lockdown: ACTIVE' : 'Activate Emergency Lockdown'}
        </button>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200">{error}</div>}
      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200">{feedback}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleSave} className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Spam Threshold (msgs)</label>
              <input
                type="number"
                value={cfg.spamThresholdCount}
                onChange={(e) => setCfg({ ...cfg, spamThresholdCount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Spam Window (sec)</label>
              <input
                type="number"
                value={cfg.spamWindowSeconds}
                onChange={(e) => setCfg({ ...cfg, spamWindowSeconds: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max Mentions / Msg</label>
              <input
                type="number"
                value={cfg.maxMentionsPerMessage}
                onChange={(e) => setCfg({ ...cfg, maxMentionsPerMessage: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Raid Join Threshold</label>
              <input
                type="number"
                value={cfg.raidJoinThreshold}
                onChange={(e) => setCfg({ ...cfg, raidJoinThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Min Account Age (hrs)</label>
              <input
                type="number"
                value={cfg.minAccountAgeHours}
                onChange={(e) => setCfg({ ...cfg, minAccountAgeHours: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Auto-Slowmode (sec)</label>
              <input
                type="number"
                value={cfg.autoSlowmodeSeconds}
                onChange={(e) => setCfg({ ...cfg, autoSlowmodeSeconds: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="accent-amber-500" />
              <span>AutoMod Enabled</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={cfg.blockDiscordInvites} onChange={(e) => setCfg({ ...cfg, blockDiscordInvites: e.target.checked })} className="accent-amber-500" />
              <span>Block External Discord Invites</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={cfg.blockSuspiciousLinks} onChange={(e) => setCfg({ ...cfg, blockSuspiciousLinks: e.target.checked })} className="accent-amber-500" />
              <span>Phishing & Suspicious Domain Filter</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Blocked Words (comma-separated)</label>
              <input
                value={cfg.blockedWords.join(', ')}
                onChange={(e) => setCfg({ ...cfg, blockedWords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exempt Roles (comma-separated)</label>
              <input
                value={cfg.exemptRoleNames.join(', ')}
                onChange={(e) => setCfg({ ...cfg, exemptRoleNames: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              Save AutoMod Rules
            </button>
          </div>
        </form>

        {/* Rule Simulator */}
        <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">Rule Evaluator Test</h3>
          <p className="text-xs text-slate-400">Test any sample message against the active deterministic AutoMod rules.</p>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Channel</label>
            <input value={testChannel} onChange={(e) => setTestChannel(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Mention Count</label>
            <input type="number" min={0} value={testMentions} onChange={(e) => setTestMentions(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Message Content</label>
            <textarea rows={3} value={testContent} onChange={(e) => setTestContent(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
          </div>
          <button
            type="button"
            onClick={handleSimulate}
            className="w-full py-2 px-4 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] text-sm font-medium text-slate-200 cursor-pointer"
          >
            Evaluate Message
          </button>
          {testResult && (
            <div className="p-3 rounded-lg bg-[#0B0D12] border border-slate-800 text-xs font-mono-tabular text-amber-300">
              {testResult}
            </div>
          )}
        </div>
      </div>

      {/* False-Positive Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleReportFp} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">Report False Positive</h3>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Rule Hit</label>
            <input value={fpRule} onChange={(e) => setFpRule(e.target.value)} required className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <input value={fpNotes} onChange={(e) => setFpNotes(e.target.value)} placeholder="Why was this message legitimate?" className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] text-sm font-medium text-slate-200 cursor-pointer">
            Submit Report for Excerpt Above
          </button>
        </form>

        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-3">
          <h3 className="font-display text-lg font-semibold text-slate-100">
            False-Positive Triage ({(guild.falsePositiveReports ?? []).length})
          </h3>
          {(guild.falsePositiveReports ?? []).length === 0 ? (
            <p className="text-xs text-slate-400">No false-positive reports submitted.</p>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {guild.falsePositiveReports.map((fp) => (
                <div key={fp.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono-tabular text-amber-300">
                      #{fp.channelName} · {fp.ruleHits.join(', ') || 'rule'} · {fp.status}
                    </p>
                    <p className="text-sm text-slate-200 truncate">{fp.sampleContent}</p>
                    <p className="text-xs text-slate-400">{fp.notes} — by {fp.reporterUsername}</p>
                  </div>
                  {fp.status === 'open' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onResolveFalsePositive(fp.id, 'resolved').catch((err) => setError(err.message))}
                        className="px-2.5 py-1 rounded border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 text-xs cursor-pointer"
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        onClick={() => onResolveFalsePositive(fp.id, 'dismissed').catch((err) => setError(err.message))}
                        className="px-2.5 py-1 rounded border border-slate-700 text-slate-300 text-xs cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
