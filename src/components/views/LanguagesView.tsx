import React, { useMemo, useState } from 'react';
import { Globe, Plus, Check, Eye } from 'lucide-react';
import type { GuildState, LanguageConfig } from '../../../packages/shared/src/types';
import { BASE_TRANSLATION_KEYS, previewLanguageChannels, type CompletenessReport } from '../../../packages/localization/src/engine';

interface LanguagesViewProps {
  guild: GuildState;
  completeness: Record<string, CompletenessReport>;
  onCreateLanguage: (payload: {
    code: string;
    name: string;
    nativeName: string;
    flagEmoji: string;
  }) => Promise<void>;
  onSaveTranslations: (
    code: string,
    payload: {
      entries: Record<string, string>;
      welcomeMessage: string;
      rulesSummary: string;
      announcementBanner: string;
    },
  ) => Promise<void>;
  onReviewLanguage: (code: string, status: 'draft' | 'in_review' | 'approved', notes: string) => Promise<void>;
  onCreateChannels: (code: string) => Promise<void>;
  onToggleLanguage: (code: string) => Promise<void>;
}

export const LanguagesView: React.FC<LanguagesViewProps> = ({
  guild,
  completeness,
  onCreateLanguage,
  onSaveTranslations,
  onReviewLanguage,
  onCreateChannels,
  onToggleLanguage,
}) => {
  const [selectedCode, setSelectedCode] = useState<string>(guild.languages[0]?.code || 'en');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState('sv');
  const [newName, setNewName] = useState('Swedish');
  const [newNative, setNewNative] = useState('Svenska');
  const [newFlag, setNewFlag] = useState('🇸🇪');
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [confirmCreateChannels, setConfirmCreateChannels] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('Verified manually by guild staff.');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedLang: LanguageConfig | undefined =
    guild.languages.find((l) => l.code === selectedCode) ?? guild.languages[0];

  const [draftEntries, setDraftEntries] = useState<Record<string, string>>({});
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [rulesMsg, setRulesMsg] = useState('');
  const [bannerMsg, setBannerMsg] = useState('');

  React.useEffect(() => {
    if (!selectedLang) return;
    setDraftEntries(guild.translations[selectedLang.code]?.entries ?? {});
    setWelcomeMsg(selectedLang.welcomeMessage);
    setRulesMsg(selectedLang.rulesSummary);
    setBannerMsg(selectedLang.announcementBanner);
    setConfirmCreateChannels(false);
  }, [selectedLang?.code, guild.translations]);

  const channelPreview = useMemo(
    () => (selectedLang ? previewLanguageChannels(selectedLang) : null),
    [selectedLang],
  );

  const report = selectedLang ? completeness[selectedLang.code] : undefined;

  const keysToShow = Object.keys(BASE_TRANSLATION_KEYS).filter((k) => {
    if (!showMissingOnly) return true;
    return !draftEntries[k] || draftEntries[k].trim().length === 0;
  });

  const handleAddLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await onCreateLanguage({
        code: newCode,
        name: newName,
        nativeName: newNative,
        flagEmoji: newFlag,
      });
      setSelectedCode(newCode.toLowerCase());
      setShowAddForm(false);
      setFeedback(`Draft language "${newName}" created from template. Enter translations manually below.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create language');
    }
  };

  const handleSave = async () => {
    if (!selectedLang) return;
    setError(null);
    setFeedback(null);
    try {
      await onSaveTranslations(selectedLang.code, {
        entries: draftEntries,
        welcomeMessage: welcomeMsg,
        rulesSummary: rulesMsg,
        announcementBanner: bannerMsg,
      });
      setFeedback(`Saved manual translations for ${selectedLang.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleApprove = async () => {
    if (!selectedLang) return;
    setError(null);
    setFeedback(null);
    try {
      await onReviewLanguage(selectedLang.code, 'approved', reviewNotes);
      setFeedback(`${selectedLang.name} marked approved and ready for channel publication.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval blocked');
    }
  };

  const handlePublishChannels = async () => {
    if (!selectedLang || !confirmCreateChannels) return;
    setError(null);
    setFeedback(null);
    try {
      await onCreateChannels(selectedLang.code);
      setConfirmCreateChannels(false);
      setFeedback(`Created ${selectedLang.name} category & channels and enabled language role.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Channel creation failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Dynamic Multilingual System
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Template-driven manual localization with versioned review, channel structure previews, and non-destructive deactivation. Zero AI translation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Language</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg border border-red-500/40 bg-red-950/30 text-red-200 text-sm">
          {error}
        </div>
      )}
      {feedback && (
        <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-950/20 text-amber-200 text-sm">
          {feedback}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddLanguage} className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">Create New Language Realm</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">ISO Code</label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
                placeholder="sv"
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">English Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                placeholder="Swedish"
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Native Name</label>
              <input
                value={newNative}
                onChange={(e) => setNewNative(e.target.value)}
                required
                placeholder="Svenska"
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Flag Emoji</label>
              <input
                value={newFlag}
                onChange={(e) => setNewFlag(e.target.value)}
                required
                placeholder="🇸🇪"
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer"
            >
              Generate Template Draft
            </button>
          </div>
        </form>
      )}

      {/* Language Selector Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {guild.languages.map((lang) => {
          const rep = completeness[lang.code];
          const active = lang.code === selectedLang?.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setSelectedCode(lang.code)}
              className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                active
                  ? 'border-amber-500/60 bg-[#171C28]'
                  : 'border-slate-800 bg-[#121620] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-slate-100">
                  {lang.flagEmoji} {lang.name}
                </span>
                <span className={`text-xs font-mono-tabular ${lang.enabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {lang.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {lang.nativeName} · v{lang.version} · {lang.review.status}
              </p>
              <div className="mt-3">
                <div className="flex justify-between text-xs font-mono-tabular text-slate-400 mb-1">
                  <span>Completeness</span>
                  <span>{rep?.completenessPercent ?? 0}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${rep?.completenessPercent ?? 0}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Language Workbench */}
      {selectedLang && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-100">
                  {selectedLang.flagEmoji} {selectedLang.name} Translation Editor
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Missing keys: {report?.missingKeys.length ?? 0} · Review status: {selectedLang.review.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMissingOnly((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#171C28] text-xs text-slate-200 cursor-pointer"
                >
                  {showMissingOnly ? 'Show All Keys' : 'Missing Keys Only'}
                </button>
                {!selectedLang.isDefault && (
                  <button
                    type="button"
                    onClick={() => onToggleLanguage(selectedLang.code).catch((err) => setError(err.message))}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#171C28] text-xs text-slate-200 cursor-pointer"
                  >
                    {selectedLang.enabled ? 'Disable (Keep Channels)' : 'Enable Language'}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Localized Welcome Message</label>
                <textarea
                  rows={2}
                  value={welcomeMsg}
                  onChange={(e) => setWelcomeMsg(e.target.value)}
                  placeholder="Enter localized welcome message..."
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Localized Rules Summary</label>
                <textarea
                  rows={2}
                  value={rulesMsg}
                  onChange={(e) => setRulesMsg(e.target.value)}
                  placeholder="Enter localized rules summary..."
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Announcement Banner</label>
                <input
                  value={bannerMsg}
                  onChange={(e) => setBannerMsg(e.target.value)}
                  placeholder="Enter localized announcement..."
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-800 max-h-[380px] overflow-y-auto pr-1">
              {keysToShow.map((key) => {
                const isMissing = !draftEntries[key] || draftEntries[key].trim().length === 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs text-slate-300">{key}</span>
                      <span className={`text-xs ${isMissing ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {isMissing ? 'Missing' : 'Translated'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">EN ref: {BASE_TRANSLATION_KEYS[key]}</p>
                    <input
                      value={draftEntries[key] ?? ''}
                      onChange={(e) => setDraftEntries((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={`Enter ${selectedLang.name} translation...`}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                Save Manual Translations
              </button>
              <div className="flex items-center gap-2">
                <input
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Review notes"
                  className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-xs text-slate-200"
                />
                <button
                  type="button"
                  onClick={handleApprove}
                  className="px-3.5 py-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-950/50 text-emerald-300 text-sm font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve Bundle</span>
                </button>
              </div>
            </div>
          </div>

          {/* Discord Channel Structure Preview & Creation Gate */}
          <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-400" />
              <h3 className="font-display text-lg font-semibold text-slate-100">Channel Structure Preview</h3>
            </div>
            {channelPreview && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[#0B0D12] border border-slate-800">
                  <p className="text-xs text-slate-400">Target Discord Category</p>
                  <p className="text-sm font-semibold text-slate-100 mt-0.5">{channelPreview.categoryName}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    Independent Role: <span className="text-slate-200">{channelPreview.roleName}</span>
                  </p>
                </div>
                <div className="divide-y divide-slate-800/70">
                  {channelPreview.channels.map((ch) => (
                    <div key={ch.key} className="py-2 flex items-center justify-between text-xs">
                      <span className="font-mono-tabular text-slate-200">{ch.name}</span>
                      <span className="text-slate-400">{ch.readOnly ? 'Read-Only' : 'Chat'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 space-y-3">
              {selectedLang.channelsCreated ? (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-xs text-emerald-300">
                  <Globe className="w-4 h-4 inline mr-1.5" />
                  Channels created & linked ({selectedLang.createdChannels.length}). Disabling this language will preserve all channels and history.
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmCreateChannels}
                      onChange={(e) => setConfirmCreateChannels(e.target.checked)}
                      className="mt-0.5 accent-amber-500"
                    />
                    <span>I have reviewed the translations and explicitly confirm creating these Discord channels.</span>
                  </label>
                  <button
                    type="button"
                    onClick={handlePublishChannels}
                    disabled={!confirmCreateChannels || !report?.readyForPublication}
                    className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-semibold text-sm cursor-pointer"
                  >
                    Create Approved Channels & Publish
                  </button>
                  {!report?.readyForPublication && (
                    <p className="text-xs text-slate-400">
                      Requires 100% translated keys, welcome/rules text, and Approved status before creation.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
