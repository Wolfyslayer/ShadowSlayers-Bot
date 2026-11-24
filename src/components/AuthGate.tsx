import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import type { AuthUserSession } from '../../packages/shared/src/types';
import { apiRequest } from '../lib/api';
import { useLocale } from '../lib/LocaleProvider';
import bannerUrl from '../assets/images/Banner.jpg';
import guildCrestUrl from '../assets/images/Icon.jpg';

interface AuthStatus {
  discordOAuthConfigured: boolean;
}

interface AuthGateProps {
  onAuthenticated: (token: string, user: AuthUserSession) => void;
  onPrivacyRequest: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated, onPrivacyRequest }) => {
  const { t } = useLocale();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<AuthStatus>('/api/auth/status')
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? t(err.message) : t('Unable to reach server')));
  }, [t]);

  useEffect(() => {
    const allowedPopupOrigins = new Set<string>([window.location.origin]);
    const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
    if (configuredApiBase) {
      try {
        allowedPopupOrigins.add(new URL(configuredApiBase).origin);
      } catch {
        // ignore invalid VITE_API_BASE_URL
      }
    }

    const handleMessage = async (event: MessageEvent) => {
      if (!allowedPopupOrigins.has(event.origin)) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_ERROR' && typeof event.data.error === 'string') {
        setError(t(event.data.error));
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && typeof event.data.token === 'string') {
        try {
          const me = await apiRequest<{ user: AuthUserSession }>('/api/auth/me', {
            token: event.data.token,
          });
          onAuthenticated(event.data.token, me.user);
        } catch (err) {
          setError(err instanceof Error ? t(err.message) : t('OAuth session verification failed'));
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthenticated, t]);

  const handleDiscordOAuth = async () => {
    setError(null);
    try {
      const { url } = await apiRequest<{ url: string }>('/api/auth/discord/url');
      const popup = window.open(url, 'discord_oauth', 'width=540,height=720');
      if (!popup) {
        setError(t('Popup was blocked by the browser. Please allow popups to sign in with Discord.'));
      }
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Discord OAuth2 is unavailable'));
    }
  };

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#090812] p-4 text-slate-100 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_8%,rgba(139,53,245,0.2),transparent_38%),radial-gradient(ellipse_at_90%_88%,rgba(139,53,245,0.12),transparent_36%)]" />
      <div className="app-panel relative grid w-full max-w-5xl grid-cols-1 overflow-hidden border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.55)] lg:grid-cols-2">
        <div className="relative flex min-h-[280px] flex-col justify-between border-b border-white/10 bg-[#0E0B18] p-7 sm:p-9 lg:min-h-[580px] lg:border-b-0 lg:border-r">
          <img
            src={bannerUrl}
            alt="ShadowSlayers community banner"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090812] via-[#090812]/65 to-[#090812]/35" />

          <div className="relative z-10 flex items-center gap-4">
            <img
              src={guildCrestUrl}
              alt="ShadowSlayers icon"
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-xl border border-violet-300/30 object-cover shadow-lg shadow-violet-950/40"
            />
            <div>
              <h1 className="font-display text-xl font-bold tracking-wide text-white">
                ShadowSlayers
              </h1>
              <p className="text-xs text-violet-200">{t('Discord Server Management Bot')}</p>
            </div>
          </div>

          <div className="relative z-10 mt-12 space-y-3">
            <h2 className="font-display text-balance text-2xl font-semibold leading-snug text-white">
              {t('One bot for your Discord community')}
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              {t('Manage onboarding, roles, moderation, AutoMod, tickets, and community tools. Add game-specific ranks and classes only when your server needs them.')}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs text-slate-400">
              <span>{t('Multi-server support')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('Discord permission checks')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('Moderation & community tools')}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center bg-[#100e1a]/80 p-7 sm:p-10">
          <div className="mb-7">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/[0.08] px-3 py-1.5 text-xs font-medium text-violet-100">
              <Shield className="h-4 w-4 text-violet-300" />
              <span>{t('Secure Discord Sign-In')}</span>
            </div>
            <h3 className="font-display text-2xl font-semibold text-white">{t('Sign in to ShadowSlayers Bot')}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {t('Use Discord to continue. You can manage servers you own or where you have Administrator or Manage Server permission.')}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-red-200 text-sm" role="alert">
              {error}
            </div>
          )}

          {!status ? (
            <div className="py-8 text-sm text-slate-400">{t('Checking server authentication state...')}</div>
          ) : (
            <button
              type="button"
              onClick={handleDiscordOAuth}
              disabled={!status?.discordOAuthConfigured}
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-violet-200/25 bg-gradient-to-r from-[#8b35f5] to-[#6729c8] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(112,37,211,0.28)] transition duration-200 hover:-translate-y-0.5 hover:from-[#9c53f7] hover:to-[#7737d3] hover:shadow-[0_16px_34px_rgba(112,37,211,0.38)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19.73 5.12A18.4 18.4 0 0 0 15.2 3.7l-.56 1.14a16.8 16.8 0 0 0-5.28 0L8.8 3.7a18.4 18.4 0 0 0-4.53 1.42C1.4 9.35.62 13.48 1 17.56a18.6 18.6 0 0 0 5.55 2.82l1.2-1.96c-.66-.24-1.28-.55-1.87-.9l.46-.36c3.6 1.67 7.5 1.67 11.06 0l.47.36c-.59.35-1.21.66-1.88.9l1.2 1.96a18.5 18.5 0 0 0 5.55-2.82c.45-4.74-.77-8.83-3.01-12.44ZM8.1 14.76c-1.08 0-1.96-.98-1.96-2.19s.86-2.2 1.96-2.2c1.1 0 1.98.99 1.96 2.2 0 1.21-.86 2.19-1.96 2.19Zm7.8 0c-1.08 0-1.96-.98-1.96-2.19s.86-2.2 1.96-2.2c1.1 0 1.98.99 1.96 2.2 0 1.21-.86 2.19-1.96 2.19Z" />
              </svg>
              <span>{status.discordOAuthConfigured ? t('Continue with Discord') : t('Discord sign-in is not configured')}</span>
            </button>
          )}
          <p className="mt-4 text-center text-xs text-slate-500">{t('Your Discord permissions are verified before server access is granted.')}</p>
          <button
            type="button"
            onClick={onPrivacyRequest}
            className="mt-6 w-full rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition hover:border-violet-300/25 hover:bg-violet-400/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
          >
            {t('Delete my ShadowSlayers data')}
          </button>
        </div>
      </div>
    </div>
  );
};
