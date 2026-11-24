import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useLocale } from '../lib/LocaleProvider';

interface PrivacyGuild {
  guildId: string;
  name: string;
}

interface PrivacyDeletionViewProps {
  onBack: () => void;
  onCompleted: () => void;
}

function isPrivacyGuild(value: unknown): value is PrivacyGuild {
  return (
    typeof value === 'object' &&
    value !== null &&
    'guildId' in value &&
    typeof value.guildId === 'string' &&
    /^\d{15,22}$/.test(value.guildId) &&
    'name' in value &&
    typeof value.name === 'string'
  );
}

export const PrivacyDeletionView: React.FC<PrivacyDeletionViewProps> = ({ onBack, onCompleted }) => {
  const { t } = useLocale();
  const [guilds, setGuilds] = useState<PrivacyGuild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [manualGuildId, setManualGuildId] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const allowedOrigins = new Set([window.location.origin]);
    const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
    if (configuredApiBase) {
      try {
        allowedOrigins.add(new URL(configuredApiBase).origin);
      } catch {
        setError(t('The configured API address is invalid.'));
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (!allowedOrigins.has(event.origin) || event.source !== popupRef.current) return;
      if (event.data?.type === 'OAUTH_AUTH_ERROR' && typeof event.data.error === 'string') {
        setError(t(event.data.error));
        return;
      }
      if (event.data?.type !== 'OAUTH_PRIVACY_DELETE_SUCCESS') return;
      if (typeof event.data.token !== 'string' || !Array.isArray(event.data.guilds)) {
        setError(t('Discord identity verification returned invalid data.'));
        return;
      }

      const verifiedGuilds = event.data.guilds.filter(isPrivacyGuild);
      setGuilds(verifiedGuilds);
      setSelectedGuildId(verifiedGuilds[0]?.guildId ?? '');
      setToken(event.data.token);
      setError(null);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [t]);

  const verifyDiscordIdentity = async () => {
    setBusy(true);
    setError(null);
    const popup = window.open('', 'discord_privacy_delete', 'width=540,height=720');
    if (!popup) {
      setError(t('Popup was blocked by the browser. Please allow popups to continue.'));
      setBusy(false);
      return;
    }
    popupRef.current = popup;

    try {
      const { url } = await apiRequest<{ url: string }>('/api/privacy/deletion/oauth-url');
      popup.location.href = url;
    } catch (err) {
      popup.close();
      popupRef.current = null;
      setError(err instanceof Error ? t(err.message) : t('Discord sign-in for data deletion is unavailable.'));
    } finally {
      setBusy(false);
    }
  };

  const deleteData = async () => {
    const guildId = manualGuildId.trim() || selectedGuildId;
    if (!token || !guildId || confirmation !== 'DELETE') return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/privacy/deletion/guild/${encodeURIComponent(guildId)}/self`, {
        method: 'DELETE',
        token,
        body: { confirm: true },
      });
      setCompleted(true);
      setToken(null);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Your data could not be removed. Please retry.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#090812] p-4 text-slate-100 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_8%,rgba(139,53,245,0.2),transparent_38%),radial-gradient(ellipse_at_90%_88%,rgba(139,53,245,0.12),transparent_36%)]" />
      <section className="app-panel relative w-full max-w-2xl border border-white/10 bg-[#100e1a]/95 p-6 shadow-2xl shadow-black/50 sm:p-9">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('Back')}
        </button>

        <div className="mb-6 flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/[0.08]">
            <Shield className="h-6 w-6 text-violet-200" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-white">{t('Delete my ShadowSlayers data')}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {t('Verify your Discord account, choose a server, and remove or anonymize information linked to your account in that server.')}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
            {error}
          </div>
        )}

        {completed ? (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-4 text-sm text-emerald-100" role="status">
            {t('Your data in the selected server was removed or anonymized. New activity may create fresh records if you remain in that server.')}
          </div>
        ) : !token ? (
          <div>
            <p className="mb-4 text-sm leading-relaxed text-slate-300">
              {t('Discord verification is used only to confirm your account. The short-lived deletion token is not stored in your browser.')}
            </p>
            <button
              type="button"
              onClick={() => void verifyDiscordIdentity()}
              disabled={busy}
              className="w-full rounded-xl border border-violet-200/25 bg-gradient-to-r from-[#8b35f5] to-[#6729c8] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:from-[#9c53f7] hover:to-[#7737d3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('Please wait…') : t('Verify with Discord')}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              {guilds.length > 0 && (
                <>
                  <label className="block text-sm font-medium text-slate-200" htmlFor="privacy-server">
                    {t('Select a server')}
                  </label>
                  <select
                    id="privacy-server"
                    value={selectedGuildId}
                    onChange={(event) => {
                      setSelectedGuildId(event.target.value);
                      setManualGuildId('');
                    }}
                    className="app-input w-full px-3 py-2.5 text-sm"
                  >
                    {guilds.map((guild) => (
                      <option key={guild.guildId} value={guild.guildId}>{guild.name}</option>
                    ))}
                  </select>
                </>
              )}
              {guilds.length === 0 && (
                <p className="text-sm text-slate-400">
                  {t('No configured servers were found in your membership list. Enter the server ID if you have left it.')}
                </p>
              )}
              <label className="block text-xs text-slate-400" htmlFor="privacy-server-id">
                {t('If the server is not listed, enter its Discord server ID.')}
              </label>
              <input
                id="privacy-server-id"
                inputMode="numeric"
                autoComplete="off"
                value={manualGuildId}
                onChange={(event) => setManualGuildId(event.target.value)}
                placeholder={t('Discord server ID')}
                className="app-input w-full px-3 py-2.5 font-mono text-sm"
              />
            </div>

            <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-relaxed text-amber-100/90">
              {t('Directly linked profile data and authored content will be removed where possible; retained moderation and audit history will be anonymized. Some legacy entries only contain usernames and cannot be reliably matched, and Discord-side data is not changed. If you remain in the server, later activity may create fresh records.')}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200" htmlFor="privacy-confirm">
                {t('Type DELETE to confirm')}
              </label>
              <input
                id="privacy-confirm"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                className="app-input w-full px-3 py-2.5 font-mono text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => void deleteData()}
              disabled={busy || (!manualGuildId.trim() && !selectedGuildId) || confirmation !== 'DELETE'}
              className="w-full rounded-xl border border-red-300/20 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('Removing your data…') : t('Delete my data from this server')}
            </button>
          </div>
        )}
      </section>
    </main>
  );
};
