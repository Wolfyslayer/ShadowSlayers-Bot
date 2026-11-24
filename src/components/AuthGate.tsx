import React, { useEffect, useState } from 'react';
import { KeyRound, Shield, Lock } from 'lucide-react';
import type { AuthUserSession } from '../../packages/shared/src/types';
import { apiRequest } from '../lib/api';

interface AuthStatus {
  discordOAuthConfigured: boolean;
  envPasscodeConfigured: boolean;
  adminClaimed: boolean;
  claimedUsername: string | null;
}

interface AuthGateProps {
  onAuthenticated: (token: string, user: AuthUserSession) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [username, setUsername] = useState('AldricShadow');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<AuthStatus>('/api/auth/status')
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to reach server'));
  }, []);

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
        setError(event.data.error);
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && typeof event.data.token === 'string') {
        try {
          const me = await apiRequest<{ user: AuthUserSession }>('/api/auth/me', {
            token: event.data.token,
          });
          onAuthenticated(event.data.token, me.user);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'OAuth session verification failed');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthenticated]);

  const handleDiscordOAuth = async () => {
    setError(null);
    try {
      const { url } = await apiRequest<{ url: string }>('/api/auth/discord/url');
      const popup = window.open(url, 'discord_oauth', 'width=540,height=720');
      if (!popup) {
        setError('Popup was blocked by the browser. Please allow popups to sign in with Discord.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discord OAuth2 is unavailable');
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Passcode must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passcodes do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUserSession }>('/api/auth/claim-admin', {
        method: 'POST',
        body: { username, password },
      });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim admin access');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUserSession }>('/api/auth/login', {
        method: 'POST',
        body: { password },
      });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D12] text-slate-100 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 border border-slate-800 bg-[#121620] rounded-xl overflow-hidden">
        <div className="relative min-h-[260px] lg:min-h-[520px] bg-[#0E1119] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between p-8">
          <img
            src="/src/assets/images/banner_sanctum_1795519524069.jpg"
            alt="ShadowSlayers Obsidian Sanctum"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/60 to-[#0B0D12]/40" />

          <div className="relative z-10 flex items-center gap-4">
            <img
              src="/src/assets/images/crest_shadowslayers_1795519523634.jpg"
              alt="ShadowSlayers Guild Crest"
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-lg object-cover border border-amber-500/40"
            />
            <div>
              <h1 className="font-display text-xl font-bold tracking-wide text-slate-100">
                ShadowSlayers
              </h1>
              <p className="text-xs text-amber-400/90">Legends of Elements Administration</p>
            </div>
          </div>

          <div className="relative z-10 space-y-3 mt-12">
            <h2 className="font-display text-2xl font-semibold text-slate-100 leading-snug text-balance">
              Centralized Guild & Discord Governance
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Non-destructive server discovery, dynamic multilingual realm management, deterministic AutoMod, moderation cases, tickets, and clan raid operations.
            </p>
            <div className="pt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>Zero AI Dependencies</span>
              <span aria-hidden="true">·</span>
              <span>Server-Verified Sessions</span>
              <span aria-hidden="true">·</span>
              <span>RBAC Hierarchy</span>
            </div>
          </div>
        </div>

        <div className="p-8 flex flex-col justify-center">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-2">
              <Shield className="w-4 h-4" />
              <span>Inner Sanctum Authentication</span>
            </div>
            <h3 className="font-display text-xl font-semibold text-slate-100">
              {status && !status.adminClaimed ? 'Claim Initial Administrator Access' : 'Sign In to Dashboard'}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {status && !status.adminClaimed
                ? 'Set the initial Shadow King passcode for this workspace, or authenticate via Discord OAuth2 once configured.'
                : 'Authenticate with your verified administrator passcode or Discord OAuth2.'}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-red-200 text-sm">
              {error}
            </div>
          )}

          {!status ? (
            <div className="py-8 text-sm text-slate-400">Checking server authentication state...</div>
          ) : !status.adminClaimed ? (
            <form onSubmit={handleClaimAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Administrator Display Name</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Passcode (min 8 characters)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Enter strong passcode"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm Passcode</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Repeat passcode"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>{loading ? 'Provisioning Access...' : 'Claim Shadow King Access'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Administrator Passcode {status.claimedUsername ? `(${status.claimedUsername})` : ''}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter administrator passcode"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{loading ? 'Verifying...' : 'Sign In'}</span>
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-slate-800">
            <button
              type="button"
              onClick={handleDiscordOAuth}
              disabled={!status?.discordOAuthConfigured}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-[#171C28] hover:bg-[#1E2535] disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-sm font-medium transition-colors cursor-pointer"
            >
              {status?.discordOAuthConfigured
                ? 'Continue with Discord OAuth2'
                : 'Discord OAuth2 (Configure DISCORD_CLIENT_ID / SECRET to enable)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
