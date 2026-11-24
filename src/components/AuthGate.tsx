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
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
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
    <div className="min-h-screen bg-[#0B0D12] text-slate-100 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 border border-slate-800 bg-[#121620] rounded-2xl overflow-hidden shadow-2xl shadow-black/30">
        <div className="relative min-h-[260px] lg:min-h-[520px] bg-[#0E1119] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between p-8">
          <img
            src={bannerUrl}
            alt="ShadowSlayers Obsidian Sanctum"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/60 to-[#0B0D12]/40" />

          <div className="relative z-10 flex items-center gap-4">
            <img
              src={guildCrestUrl}
              alt="ShadowSlayers Guild Crest"
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-lg object-cover border border-amber-500/40"
            />
            <div>
              <h1 className="font-display text-xl font-bold tracking-wide text-slate-100">
                ShadowSlayers
              </h1>
              <p className="text-xs text-violet-300">{t('Legends of Elements Administration')}</p>
            </div>
          </div>

          <div className="relative z-10 space-y-3 mt-12">
            <h2 className="font-display text-2xl font-semibold text-slate-100 leading-snug text-balance">
              {t('Centralized Guild & Discord Governance')}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {t('Non-destructive server discovery, dynamic multilingual realm management, deterministic AutoMod, moderation cases, tickets, and clan raid operations.')}
            </p>
            <div className="pt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>{t('Zero AI Dependencies')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('Server-Verified Sessions')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('RBAC Hierarchy')}</span>
            </div>
          </div>
        </div>

        <div className="p-8 flex flex-col justify-center">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-2">
              <Shield className="w-4 h-4" />
              <span>{t('Inner Sanctum Authentication')}</span>
            </div>
            <h3 className="font-display text-xl font-semibold text-slate-100">{t('Sign In to Dashboard')}</h3>
            <p className="text-sm text-slate-400 mt-1">
              {t('Sign in with Discord to access servers where you are the owner or have Administrator or Manage Server permissions.')}
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
              className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-sm font-medium transition-colors cursor-pointer"
            >
              {status.discordOAuthConfigured ? t('Continue with Discord') : t('Discord sign-in is not configured')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
