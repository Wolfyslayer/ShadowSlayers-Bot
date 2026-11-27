import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { loadEnv } from './packages/config/src/env.ts';
import { createDatabaseAdapter } from './packages/database/src/adapter.ts';
import { createEmptyGuild } from './packages/database/src/empty-guild.ts';
import {
  calculateCompleteness,
  createLanguageDraft,
  previewLanguageChannels,
} from './packages/localization/src/engine.ts';
import {
  canActOnTargetRank,
  canAssignClanRank,
  mergeIndependentLanguageRoles,
  type PermissionCapability,
} from './packages/permissions/src/hierarchy.ts';
import {
  hasDiscordDashboardCapability,
  qualifiesAsDiscordGuildManager,
  type DiscordOAuthGuildAccess,
} from './packages/permissions/src/discord-guild-access.ts';
import {
  signPrivacyDeletionToken,
  verifyPrivacyDeletionToken,
} from './packages/permissions/src/privacy-deletion-token.ts';
import type {
  AuthUserSession,
  AuthorizedDiscordGuild,
  GuildState,
  LogCategory,
} from './packages/shared/src/types.ts';
import type {
  BotControlCommand,
  BotControlOperation,
  BotControlPayloadMap,
  BotControlResultMap,
  BotRuntimeSnapshot,
} from './packages/shared/src/bot-control.ts';
import {
  signBotControlCommand,
  verifyBotControlResult,
} from './packages/shared/src/bot-control-signature.ts';
import { normalizeGameLabels } from './packages/shared/src/game-config.ts';
import { createGuildBackupExport } from './packages/shared/src/guild-backup.ts';
import { SlidingWindowRateLimiter } from './packages/shared/src/sliding-window-rate-limiter.ts';
import {
  appealReviewSchema,
  automodUpdateSchema,
  commandExecuteSchema,
  customResponseCreateSchema,
  falsePositiveCreateSchema,
  languageCreateSchema,
  languageReviewSchema,
  memberUpdateSchema,
  moderationActionSchema,
  recruitmentReviewSchema,
  recruitmentSubmitSchema,
  rolePanelCreateSchema,
  safeIdSchema,
  ticketActionSchema,
  ticketCreateSchema,
  ticketMessageSchema,
  translationUpdateSchema,
} from './packages/shared/src/validation.ts';
import { SLASH_COMMANDS } from './apps/bot/src/commands/registry.ts';
import { RuleBasedAutoModEngine } from './apps/bot/src/services/automod.ts';
import {
  applyRulesVerificationReaction,
  computeMemberOnboardingStatus,
  grantActivePlayerRecruit,
} from './apps/bot/src/services/onboarding.ts';

interface AuthenticatedRequest extends Request {
  sessionUser?: AuthUserSession;
}

interface OAuthState {
  createdAt: number;
  targetOrigin: string;
  flow: 'dashboard' | 'privacy-deletion';
}

const env = loadEnv();
const SESSION_KEY = env.sessionSecret || crypto.randomBytes(32).toString('hex');
const oauthStates = new Map<string, OAuthState>();
const discordAccessCache = new Map<string, { expiresAt: number; access: DiscordOAuthGuildAccess | null }>();

function signSessionToken(payload: AuthUserSession): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_KEY).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySessionToken(token: string): AuthUserSession | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_KEY).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as AuthUserSession;
    if (parsed.provider !== 'discord_oauth' || !Array.isArray(parsed.authorizedGuildIds)) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function rateLimit(maxRequests: number, windowMs: number) {
  const limiter = new SlidingWindowRateLimiter(maxRequests, windowMs);
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const result = limiter.consume(ip);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      if (result.reason === 'capacity') {
        res.status(503).json({ error: 'Rate limiter is temporarily at capacity. Please retry shortly.' });
        return;
      }
      res.status(429).json({ error: 'Rate limit exceeded. Please wait briefly before retrying.' });
      return;
    }
    next();
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchLiveDiscordGuildAccess(
  guildId: string,
  userId: string,
): Promise<DiscordOAuthGuildAccess | null> {
  if (!env.discordBotToken) {
    throw new Error('DISCORD_BOT_TOKEN is required to verify guild access.');
  }
  const cacheKey = `${guildId}:${userId}`;
  const cached = discordAccessCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.access;

  const headers = { Authorization: `Bot ${env.discordBotToken}` };
  const base = `https://discord.com/api/v10/guilds/${guildId}`;
  const [guildResp, memberResp, rolesResp] = await Promise.all([
    fetch(base, { headers }),
    fetch(`${base}/members/${userId}`, { headers }),
    fetch(`${base}/roles`, { headers }),
  ]);
  if ([guildResp.status, memberResp.status, rolesResp.status].includes(404)) {
    discordAccessCache.set(cacheKey, { expiresAt: Date.now() + 15_000, access: null });
    return null;
  }
  if (!guildResp.ok || !memberResp.ok || !rolesResp.ok) {
    throw new Error('Discord rejected live guild permission verification.');
  }

  const [guild, member, roles] = await Promise.all([
    guildResp.json() as Promise<{ id: string; name: string; owner_id: string }>,
    memberResp.json() as Promise<{ roles: string[] }>,
    rolesResp.json() as Promise<Array<{ id: string; permissions: string }>>,
  ]);
  const roleIds = new Set([guildId, ...member.roles]);
  let permissions = 0n;
  for (const role of roles) {
    if (!roleIds.has(role.id)) continue;
    if (!/^\d+$/.test(role.permissions)) {
      throw new Error('Discord returned an invalid guild role permission bitfield.');
    }
    permissions |= BigInt(role.permissions);
  }
  const access = {
    id: guildId,
    name: guild.name,
    owner: guild.owner_id === userId,
    permissions: permissions.toString(),
  };
  discordAccessCache.set(cacheKey, { expiresAt: Date.now() + 15_000, access });
  return access;
}

async function bootstrap() {
  if (env.nodeEnv === 'production') {
    let appUrl: URL;
    try {
      appUrl = new URL(env.appUrl);
    } catch {
      throw new Error('APP_URL must be an absolute HTTPS URL in production.');
    }
    if (
      appUrl.protocol !== 'https:' ||
      appUrl.origin !== env.appUrl ||
      appUrl.username ||
      appUrl.password ||
      appUrl.search ||
      appUrl.hash
    ) {
      throw new Error('APP_URL must be an HTTPS origin without credentials, path, query, or fragment in production.');
    }
  }
  if (env.nodeEnv === 'production' && !env.sessionSecret) {
    throw new Error('SESSION_SECRET must be configured for production API sessions.');
  }
  if (env.nodeEnv === 'production' && env.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
  }
  if (env.nodeEnv === 'production' && env.databaseAdapter !== 'firestore') {
    throw new Error('Production API deployments require DATABASE_ADAPTER=firestore.');
  }
  if (env.databaseAdapter === 'firestore' && env.botControlSecret.length < 32) {
    throw new Error('BOT_CONTROL_SECRET must contain at least 32 characters when DATABASE_ADAPTER=firestore.');
  }
  const db = createDatabaseAdapter(
    env.databaseAdapter,
    env.localDbPath,
    undefined,
    env.nodeEnv,
    env.firebase,
  );
  await db.init();

  const botStatusUnavailable: BotRuntimeSnapshot = {
    connected: false,
    mode: 'standby_no_token',
    botTag: null,
    guildCount: 0,
    guildIds: [],
    lastError: 'The bot has not published a runtime heartbeat.',
    startedAt: null,
    updatedAt: new Date(0).toISOString(),
  };
  const getBotRuntimeStatus = async (): Promise<BotRuntimeSnapshot> => {
    let stored: BotRuntimeSnapshot | null;
    try {
      stored = await db.getBotRuntimeStatus();
    } catch (err) {
      return {
        ...botStatusUnavailable,
        lastError: `Could not read bot runtime status: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!stored) return botStatusUnavailable;
    const updatedAtMs = Date.parse(stored.updatedAt);
    if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > 30_000 || updatedAtMs > Date.now() + 30_000) {
      return {
        ...stored,
        connected: false,
        lastError: 'The bot runtime heartbeat is stale.',
      };
    }
    return stored;
  };
  const getPublicBotRuntimeStatus = async () => {
    const { connected, mode, botTag, guildCount, lastError, startedAt, updatedAt } =
      await getBotRuntimeStatus();
    return { connected, mode, botTag, guildCount, lastError, startedAt, updatedAt };
  };
  const dispatchBotCommand = async <T extends BotControlOperation>(
    guildId: string,
    actor: Pick<AuthUserSession, 'userId' | 'username'>,
    operation: T,
    payload: BotControlPayloadMap[T],
  ): Promise<
    | { ok: true; result: BotControlResultMap[T] }
    | { ok: false; status: number; error: string }
  > => {
    if (db.driverName !== 'firestore') {
      return {
        ok: false,
        status: 503,
        error: 'API-to-bot commands require DATABASE_ADAPTER=firestore on both the API and bot processes.',
      };
    }
    if (env.botControlSecret.length < 32) {
      return {
        ok: false,
        status: 503,
        error: 'BOT_CONTROL_SECRET must contain at least 32 characters on the API and bot processes.',
      };
    }

    let runtime: BotRuntimeSnapshot;
    try {
      runtime = await getBotRuntimeStatus();
    } catch (err) {
      return {
        ok: false,
        status: 503,
        error: `Could not read bot runtime status: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!runtime.connected || !runtime.guildIds.includes(guildId)) {
      return {
        ok: false,
        status: 503,
        error: `The bot is offline or not connected to Discord guild ${guildId}.`,
      };
    }

    const now = new Date();
    const commandId = `${now.getTime().toString(36).padStart(10, '0')}${crypto.randomUUID().replace(/-/g, '')}`;
    const command = {
      id: commandId,
      guildId,
      operation,
      payload,
      actorUserId: actor.userId,
      actorUsername: actor.username,
      signature: '',
      status: 'queued',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 120_000).toISOString(),
    } as BotControlCommand<T>;
    command.signature = signBotControlCommand(command, env.botControlSecret);
    try {
      await db.enqueueBotCommand(command);
    } catch (err) {
      return {
        ok: false,
        status: 503,
        error: `Could not queue the bot command: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      let current: BotControlCommand | null;
      try {
        current = await db.getBotCommand(guildId, commandId);
      } catch (err) {
        return {
          ok: false,
          status: 503,
          error: `Could not read the bot command result: ${err instanceof Error ? err.message : String(err)}. The Discord outcome may be unknown; check the guild before retrying.`,
        };
      }
      if (current?.status === 'completed' && current.operation === operation) {
        if (!verifyBotControlResult(current, env.botControlSecret)) {
          return {
            ok: false,
            status: 502,
            error: 'Bot command result signature is missing or invalid.',
          };
        }
        return { ok: true, result: current.result as BotControlResultMap[T] };
      }
      if (current?.status === 'failed' || current?.status === 'cancelled') {
        return {
          ok: false,
          status: current.status === 'cancelled' ? 504 : 502,
          error: current.error || 'The bot did not complete the command.',
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    let cancelled = false;
    try {
      cancelled = await db.cancelQueuedBotCommand(
        guildId,
        commandId,
        'API timed out before the bot claimed the command.',
        new Date().toISOString(),
      );
    } catch (err) {
      return {
        ok: false,
        status: 503,
        error: `Could not confirm cancellation of the timed-out bot command: ${err instanceof Error ? err.message : String(err)}. Check the guild before retrying.`,
      };
    }
    return {
      ok: false,
      status: 504,
      error: cancelled
        ? 'The bot did not claim the command before timeout; it was cancelled without execution.'
        : 'The bot command timed out after being claimed. Its Discord outcome may be unknown; check the guild before retrying.',
    };
  };

  const automodEngine = new RuleBasedAutoModEngine();
  const app = express();
  app.set('trust proxy', 1);

  app.param('guildId', (_req, res, next, guildId) => {
    const parsed = safeIdSchema.safeParse(guildId);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid guildId parameter.' });
      return;
    }
    next();
  });

  const authRateLimit = rateLimit(30, 60_000);
  const oauthCallbackRateLimit = rateLimit(10, 60_000);
  const mutationRateLimit = rateLimit(60, 60_000);

  // Explicit origin-checked CORS (never wildcard * or overly broad domain suffixes)
  app.use((req, res, next) => {
    const origin = req.headers.origin?.replace(/\/+$/, '');
    const allowedOrigins = new Set<string>(env.allowedOrigins);
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use('/api/auth', authRateLimit);
  app.use('/auth/callback', oauthCallbackRateLimit);
  app.use('/api/guild', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      mutationRateLimit(req, res, next);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const requireAuth = (capability?: PermissionCapability, module?: keyof import('./packages/shared/src/types.ts').GuildModulesConfig) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const session = verifySessionToken(token);
      if (!session) {
        res.status(401).json({ error: 'Invalid or expired session token' });
        return;
      }

      let activeDiscordAccess: DiscordOAuthGuildAccess | null = null;
      const targetGuildId = req.params.guildId || session.guildId || '';
      if (targetGuildId) {
        if (!session.authorizedGuildIds.includes(targetGuildId)) {
          res.status(403).json({ error: 'This session is not authorized for the requested guild.' });
          return;
        }
        try {
          activeDiscordAccess = await fetchLiveDiscordGuildAccess(targetGuildId, session.userId);
        } catch {
          res.status(503).json({ error: 'Could not verify current Discord guild permissions. Retry shortly.' });
          return;
        }
        if (!activeDiscordAccess || !qualifiesAsDiscordGuildManager(activeDiscordAccess)) {
          discordAccessCache.delete(`${targetGuildId}:${session.userId}`);
          res.status(403).json({ error: 'Current Discord guild permissions no longer authorize this dashboard.' });
          return;
        }
      }

      if (capability) {
        if (
          !activeDiscordAccess ||
          !hasDiscordDashboardCapability(
            activeDiscordAccess,
            capability,
            typeof req.body?.action === 'string' ? req.body.action : undefined,
          )
        ) {
          res.status(403).json({ error: `Missing Discord permission for dashboard capability: ${capability}` });
          return;
        }
      }
      if (module) {
        try {
          const guild = await db.getGuild(targetGuildId);
          if (!guild) {
            res.status(404).json({ error: 'Guild not found' });
            return;
          }
          if (guild.modules?.[module] !== true) {
            res.status(403).json({ error: 'This module is disabled for this guild.' });
            return;
          }
        } catch {
          res.status(503).json({ error: 'Could not verify the guild module configuration. Retry shortly.' });
          return;
        }
      }
      req.sessionUser = session;
      next();
    };
  };

  async function recordDashboardAudit(
    guildId: string,
    actor: AuthUserSession,
    category: LogCategory,
    targetId: string | null,
    targetName: string | null,
    summary: string,
    details: Record<string, string | number | boolean | null> = {},
  ) {
    await db.appendAuditLog(guildId, {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      guildId,
      category,
      actorId: actor.userId,
      actorName: actor.username,
      targetId,
      targetName,
      summary,
      details,
      createdAt: new Date().toISOString(),
    });
  }

  // Health endpoint
  app.get('/api/health', async (_req, res) => {
    const guildIds = await db.listGuildIds();
    res.json({
      ok: true,
      service: 'ShadowSlayers Discord Bot',
      databaseAdapter: db.driverName,
      bot: await getPublicBotRuntimeStatus(),
      guildCount: guildIds.length,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/auth/status', (_req, res) => {
    const discordOAuthConfigured = Boolean(env.discordClientId && env.discordClientSecret);
    res.json({ discordOAuthConfigured });
  });

  // Discord OAuth2 URL endpoint (Popup flow — opens Discord URL directly)
  app.get('/api/auth/discord/url', (req, res) => {
    if (!env.discordClientId || !env.discordClientSecret) {
      res.status(503).json({
        error: 'Discord OAuth2 is not configured yet. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in server environment.',
      });
      return;
    }
    const targetOrigin = req.headers.origin?.replace(/\/+$/, '');
    if (!targetOrigin || !env.allowedOrigins.includes(targetOrigin)) {
      res.status(403).json({ error: 'Discord OAuth2 must be started from a configured dashboard origin.' });
      return;
    }
    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, { createdAt: Date.now(), targetOrigin, flow: 'dashboard' });
    const redirectUri = `${env.appUrl}/auth/callback`;
    const params = new URLSearchParams({
      client_id: env.discordClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state,
    });
    res.json({ url: `https://discord.com/oauth2/authorize?${params.toString()}` });
  });

  const privacyRateLimit = rateLimit(5, 60_000);
  app.use('/api/privacy/deletion', privacyRateLimit);

  app.get('/api/privacy/deletion/oauth-url', (req, res) => {
    if (!env.discordClientId || !env.discordClientSecret) {
      res.status(503).json({ error: 'Discord OAuth2 is not configured.' });
      return;
    }
    const targetOrigin = req.headers.origin?.replace(/\/+$/, '');
    if (!targetOrigin || !env.allowedOrigins.includes(targetOrigin)) {
      res.status(403).json({ error: 'Discord OAuth2 must be started from a configured dashboard origin.' });
      return;
    }

    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, { createdAt: Date.now(), targetOrigin, flow: 'privacy-deletion' });
    const params = new URLSearchParams({
      client_id: env.discordClientId,
      redirect_uri: `${env.appUrl}/auth/callback`,
      response_type: 'code',
      scope: 'identify guilds',
      state,
    });
    res.json({ url: `https://discord.com/oauth2/authorize?${params.toString()}` });
  });

  const handleDiscordCallback = async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    const stateEntry = state ? oauthStates.get(state) : undefined;
    const stateExpired = !stateEntry || Date.now() - stateEntry.createdAt > 5 * 60_000;
    if (!code && state && !stateExpired && stateEntry?.flow === 'privacy-deletion') {
      oauthStates.delete(state);
      const targetOrigin = JSON.stringify(stateEntry.targetOrigin);
      res.status(400).send(`<!doctype html><html><body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'Discord authorization was cancelled.' }, ${targetOrigin});
            window.close();
          }
        </script>
        <p>Discord authorization was cancelled.</p>
      </body></html>`);
      return;
    }
    if (!code || !state || stateExpired) {
      if (state) oauthStates.delete(state);
      res.status(400).send('Invalid or expired OAuth state.');
      return;
    }
    oauthStates.delete(state);

    if (stateEntry.flow === 'privacy-deletion') {
      const targetOrigin = JSON.stringify(stateEntry.targetOrigin);
      const sendPopupError = (reason: string, status = 502) => {
        const safeReason = JSON.stringify(reason).replace(/</g, '\\u003c');
        res.status(status).send(`<!doctype html><html><body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${safeReason} }, ${targetOrigin});
              window.close();
            }
          </script>
          <p>${escapeHtml(reason)}</p>
        </body></html>`);
      };

      try {
        const tokenResp = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: env.discordClientId ?? '',
            client_secret: env.discordClientSecret ?? '',
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${env.appUrl}/auth/callback`,
          }),
        });
        if (!tokenResp.ok) {
          sendPopupError('Discord authorization could not be completed.');
          return;
        }
        const tokenJson = (await tokenResp.json()) as { access_token: string };
        const [userResp, guildsResp] = await Promise.all([
          fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          }),
          fetch('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          }),
        ]);
        if (!userResp.ok || !guildsResp.ok) {
          sendPopupError('Discord identity or server list could not be verified.');
          return;
        }
        const discordUser = (await userResp.json()) as { id: string };
        if (!/^\d{15,22}$/.test(discordUser.id)) {
          sendPopupError('Discord returned an invalid account identifier.');
          return;
        }
        const userGuilds = (await guildsResp.json()) as Array<{ id: string; name: string }>;
        const storedGuildIds = new Set(await db.listGuildIds());
        const guilds = userGuilds
          .filter((guild) => /^\d{15,22}$/.test(guild.id) && storedGuildIds.has(guild.id))
          .map(({ id, name }) => ({ guildId: id, name }));
        const result = {
          type: 'OAUTH_PRIVACY_DELETE_SUCCESS',
          token: signPrivacyDeletionToken(discordUser.id, SESSION_KEY),
          guilds,
        };
        const resultJson = JSON.stringify(result)
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e')
          .replace(/&/g, '\\u0026');
        res.send(`<!doctype html><html><body>
          <script>
            if (window.opener) {
              window.opener.postMessage(${resultJson}, ${targetOrigin});
              window.close();
            }
          </script>
          <p>Discord identity verified. Closing window...</p>
        </body></html>`);
      } catch (err) {
        console.error('[ShadowSlayers] Privacy deletion OAuth callback failed:', err);
        sendPopupError('Discord sign-in for data deletion failed. Please retry.');
      }
      return;
    }

    if (!env.discordClientId || !env.discordClientSecret) {
      res.status(500).send('Discord OAuth2 credentials missing on server.');
      return;
    }

    const targetOrigin = JSON.stringify(stateEntry.targetOrigin);

    try {
      const tokenResp = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.discordClientId,
          client_secret: env.discordClientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${env.appUrl}/auth/callback`,
        }),
      });
      if (!tokenResp.ok) {
        res.status(502).send('Failed to exchange Discord authorization code.');
        return;
      }
      const tokenJson = (await tokenResp.json()) as { access_token: string };
      const [userResp, guildsResp] = await Promise.all([
        fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        }),
        fetch('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        }),
      ]);
      if (!userResp.ok || !guildsResp.ok) {
        res.status(502).send('Failed to fetch Discord user profile or guild memberships.');
        return;
      }

      const discordUser = (await userResp.json()) as { id: string; username: string; avatar: string | null };
      const userGuilds = (await guildsResp.json()) as Array<{
        id: string;
        name: string;
        owner: boolean;
        permissions: string;
      }>;
      const authorizedGuilds: AuthorizedDiscordGuild[] = [];

      for (const oauthGuild of userGuilds) {
        if (!/^\d{15,22}$/.test(oauthGuild.id) || !qualifiesAsDiscordGuildManager(oauthGuild)) continue;
        const liveAccess = await fetchLiveDiscordGuildAccess(oauthGuild.id, discordUser.id);
        if (!liveAccess || !qualifiesAsDiscordGuildManager(liveAccess)) continue;

        let guild = await db.getGuild(oauthGuild.id);
        if (!guild) {
          guild = createEmptyGuild(oauthGuild.id, liveAccess.name);
          await db.saveGuild(guild);
        } else if (guild.guildName !== liveAccess.name) {
          guild.guildName = liveAccess.name;
          await db.saveGuild(guild);
        }

        authorizedGuilds.push({
          guildId: oauthGuild.id,
          name: liveAccess.name,
          owner: liveAccess.owner,
          permissions: liveAccess.permissions,
        });
      }

      if (authorizedGuilds.length === 0) {
        const reason = env.discordBotToken
          ? 'No guilds were found where you have Administrator or Manage Server access and the bot is installed.'
          : 'Discord guild verification is not configured. Set DISCORD_BOT_TOKEN on the trusted API.';
        res.status(403).send(`<!doctype html><html><body style="background:#0B0D12;color:#fca5a5;font-family:sans-serif;padding:24px;">
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(reason)} }, ${targetOrigin});
              window.close();
            }
          </script>
          <h3>Access Denied (403)</h3>
          <p>${escapeHtml(reason)}</p>
        </body></html>`);
        return;
      }

      const session: AuthUserSession = {
        userId: discordUser.id,
        username: discordUser.username,
        avatarUrl: discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
          : null,
        provider: 'discord_oauth',
        clanRank: null,
        guildVerified: true,
        guildId: authorizedGuilds[0].guildId,
        authorizedGuildIds: authorizedGuilds.map((guild) => guild.guildId),
        discordRoleIds: [],
        permissions: [],
        lastVerifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
      };
      const sessionToken = signSessionToken(session);
      res.send(`<!doctype html><html><body style="background:#0B0D12;color:#f8fafc;font-family:sans-serif;padding:24px;">
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: ${JSON.stringify(sessionToken)} }, ${targetOrigin});
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
        <p>Discord authentication verified. Closing window...</p>
      </body></html>`);
    } catch (err) {
      console.error('[ShadowSlayers] Discord OAuth callback failed:', err);
      res.status(502).send('Discord OAuth verification failed. Check the trusted API logs.');
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], handleDiscordCallback);

  app.get('/api/auth/me', requireAuth(), (req: AuthenticatedRequest, res) => {
    res.json({ user: req.sessionUser });
  });

  app.get('/api/auth/guilds', requireAuth(), async (req: AuthenticatedRequest, res) => {
    const user = req.sessionUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const guilds = await Promise.all(
      user.authorizedGuildIds.map(async (guildId) => {
        const guild = await db.getGuild(guildId);
        return guild ? { guildId, name: guild.guildName } : null;
      }),
    );
    res.json({ guilds: guilds.filter((guild) => guild !== null) });
  });

  app.delete('/api/privacy/deletion/guild/:guildId/self', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = token ? verifyPrivacyDeletionToken(token, SESSION_KEY) : null;
    if (!session) {
      res.status(401).json({ error: 'A valid, recent Discord identity verification is required.' });
      return;
    }

    const guildIdParse = safeIdSchema.safeParse(req.params.guildId);
    if (!guildIdParse.success) {
      res.status(400).json({ error: 'Invalid guildId.' });
      return;
    }
    if (req.body?.confirm !== true) {
      res.status(400).json({ error: 'Explicit confirmation is required.' });
      return;
    }

    try {
      if (!(await db.getGuild(guildIdParse.data))) {
        res.status(404).json({ error: 'Server data not found.' });
        return;
      }
      await db.anonymizeGuildUserData(guildIdParse.data, session.userId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[ShadowSlayers] Personal-data deletion failed:', err);
      res.status(500).json({ error: 'Your data could not be removed. Please retry or contact support.' });
    }
  });

  // Guild State
  app.get('/api/guild/:guildId/state', requireAuth('overview.view'), async (req: AuthenticatedRequest, res) => {
    const guildIdParse = safeIdSchema.safeParse(req.params.guildId);
    if (!guildIdParse.success) {
      res.status(400).json({ error: 'Invalid guildId' });
      return;
    }
    const guild = await db.getGuild(guildIdParse.data);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    const languageCompleteness = Object.fromEntries(
      guild.languages.map((lang) => [lang.code, calculateCompleteness(lang, guild.translations[lang.code])]),
    );

    res.json({
      guild,
      languageCompleteness,
      commands: SLASH_COMMANDS,
      botStatus: await getPublicBotRuntimeStatus(),
    });
  });

  // Discovery: Non-destructive rescan & explicit confirmation
  app.post('/api/guild/:guildId/discovery/rescan', requireAuth('discovery.view', 'discovery'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const command = await dispatchBotCommand(
      guild.guildId,
      req.sessionUser!,
      'guild.rescan',
      { snapshot: guild.discovery },
    );
    if (!command.ok) {
      res.status(command.status).json({ error: command.error });
      return;
    }
    const liveRescanned = command.result;
    guild.discovery = liveRescanned;
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      guild.guildId,
      guild.guildName,
      `Ran non-destructive live server discovery (${guild.discovery.categories.length} categories, ${guild.discovery.roles.length} roles).`,
    );
    res.json({ discovery: guild.discovery, liveDiscord: true });
  });

  app.post('/api/guild/:guildId/discovery/confirm', requireAuth('discovery.apply', 'discovery'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    if (req.body?.confirmed !== true) {
      res.status(400).json({ error: 'Explicit administrator confirmation is required before applying setup changes.' });
      return;
    }

    const mode = req.body?.mode === 'full_setup' ? 'full_setup' : 'missing_only';
    const command = await dispatchBotCommand(
      guild.guildId,
      req.sessionUser!,
      'guild.setup',
      { snapshot: guild.discovery, mode, actorUsername: req.sessionUser!.username },
    );
    if (!command.ok) {
      res.status(command.status).json({ error: command.error });
      return;
    }
    const liveReport = command.result;
    guild.discovery = liveReport.snapshot;
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      guild.guildId,
      guild.guildName,
      `Executed live additive setup (${mode}): ${liveReport.appliedCount} applied, ${liveReport.failedCount} failed, ${liveReport.skippedConflicts} conflicts skipped.`,
    );
    res.json({
      discovery: guild.discovery,
      executionMode: 'live_discord',
      report: {
        appliedCount: liveReport.appliedCount,
        failedCount: liveReport.failedCount,
        skippedConflicts: liveReport.skippedConflicts,
        skippedManualItems: liveReport.skippedManualItems,
        failures: liveReport.failures,
      },
    });
  });

  // Dynamic Language Management (Zero AI)
  app.post('/api/guild/:guildId/languages', requireAuth('languages.manage', 'multilingual'), async (req: AuthenticatedRequest, res) => {
    const parsed = languageCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid language payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const code = parsed.data.code.toLowerCase();
    if (guild.languages.some((l) => l.code === code)) {
      res.status(409).json({ error: `Language "${code}" already exists.` });
      return;
    }

    const { config, bundle } = createLanguageDraft({
      ...parsed.data,
      actorName: req.sessionUser!.username,
    });
    guild.languages.push(config);
    guild.translations[code] = bundle;

    // Ensure a corresponding independent language role record exists
    if (!guild.discovery.roles.some((r) => r.category === 'language' && r.name.toLowerCase() === config.roleName.toLowerCase())) {
      guild.discovery.roles.push({
        id: `role-lang-${code}`,
        discordRoleId: null,
        name: config.roleName,
        aliases: [config.name, config.nativeName],
        category: 'language',
        rankOrder: 0,
        position: 0,
        permissionsBitfield: '0',
        intendedPermissions: [],
        colorHex: null,
        hoist: null,
        selfAssignable: true,
        exclusiveGroupId: guild.onboarding.allowMultipleLanguages ? null : 'language_exclusive',
        discoveredFromExisting: false,
        mapped: false,
        mentionable: false,
        lifecycleState: 'proposed',
      });
    }

    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      code,
      config.name,
      `Created draft language "${config.name}" (${code}) from template; awaiting manual translation and review.`,
    );
    res.status(201).json({
      language: config,
      bundle,
      completeness: calculateCompleteness(config, bundle),
      channelPreview: previewLanguageChannels(config),
    });
  });

  app.patch('/api/guild/:guildId/languages/:code/translations', requireAuth('languages.manage', 'multilingual'), async (req: AuthenticatedRequest, res) => {
    const parsed = translationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid translation update payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const code = req.params.code.toLowerCase();
    const lang = guild?.languages.find((l) => l.code === code);
    if (!guild || !lang) {
      res.status(404).json({ error: 'Language not found' });
      return;
    }

    const now = new Date().toISOString();
    const bundle = guild.translations[code] ?? { code, version: lang.version, entries: {}, updatedBy: req.sessionUser!.username, updatedAt: now };
    bundle.entries = { ...bundle.entries, ...parsed.data.entries };
    bundle.version += 1;
    bundle.updatedBy = req.sessionUser!.username;
    bundle.updatedAt = now;
    guild.translations[code] = bundle;

    if (parsed.data.welcomeMessage !== undefined) lang.welcomeMessage = parsed.data.welcomeMessage;
    if (parsed.data.rulesSummary !== undefined) lang.rulesSummary = parsed.data.rulesSummary;
    if (parsed.data.announcementBanner !== undefined) lang.announcementBanner = parsed.data.announcementBanner;
    lang.version = bundle.version;
    lang.updatedAt = now;
    if (lang.review.status === 'approved') {
      lang.review.status = 'in_review';
    }

    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      code,
      lang.name,
      `Updated manual translations for ${lang.name} (v${lang.version}).`,
    );
    res.json({ language: lang, bundle, completeness: calculateCompleteness(lang, bundle) });
  });

  app.post('/api/guild/:guildId/languages/:code/review', requireAuth('languages.approve', 'multilingual'), async (req: AuthenticatedRequest, res) => {
    const parsed = languageReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid review payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const code = req.params.code.toLowerCase();
    const lang = guild?.languages.find((l) => l.code === code);
    if (!guild || !lang) {
      res.status(404).json({ error: 'Language not found' });
      return;
    }

    const report = calculateCompleteness(lang, guild.translations[code]);
    if (parsed.data.status === 'approved' && (report.missingKeys.length > 0 || !lang.welcomeMessage.trim() || !lang.rulesSummary.trim())) {
      res.status(400).json({
        error: `Cannot approve ${lang.name}: ${report.missingKeys.length} translation key(s) or welcome/rules text still missing.`,
        missingKeys: report.missingKeys,
      });
      return;
    }

    lang.review = {
      status: parsed.data.status,
      reviewedBy: req.sessionUser!.username,
      reviewedAt: new Date().toISOString(),
      notes: parsed.data.notes,
    };
    lang.updatedAt = new Date().toISOString();
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      code,
      lang.name,
      `Marked ${lang.name} translation review status as "${parsed.data.status}".`,
    );
    res.json({ language: lang, completeness: calculateCompleteness(lang, guild.translations[code]) });
  });

  app.post('/api/guild/:guildId/languages/:code/create-channels', requireAuth('languages.approve', 'multilingual'), async (req: AuthenticatedRequest, res) => {
    if (req.body?.confirmed !== true) {
      res.status(400).json({ error: 'Explicit administrator confirmation is required to create language channels.' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const code = req.params.code.toLowerCase();
    const lang = guild?.languages.find((l) => l.code === code);
    if (!guild || !lang) {
      res.status(404).json({ error: 'Language not found' });
      return;
    }

    const completeness = calculateCompleteness(lang, guild.translations[code]);
    if (!completeness.readyForPublication) {
      res.status(400).json({ error: 'Language translations must be 100% complete and approved before channel creation.' });
      return;
    }

    const preview = previewLanguageChannels(lang);
    const command = await dispatchBotCommand(
      guild.guildId,
      req.sessionUser!,
      'language.createChannels',
      {
        categoryName: preview.categoryName,
        languageRoleName: lang.roleName,
        channels: preview.channels,
        actorUsername: req.sessionUser!.username,
      },
    );
    if (!command.ok) {
      await recordDashboardAudit(
        guild.guildId,
        req.sessionUser!,
        'channel_create',
        code,
        lang.name,
        `Language channel creation for ${lang.name} failed before completion: ${command.error}`,
      );
      res.status(command.status).json({ error: command.error });
      return;
    }

    const discordResult = command.result;
    if (!discordResult.ok) {
      await recordDashboardAudit(
        guild.guildId,
        req.sessionUser!,
        'channel_create',
        code,
        preview.categoryName,
        `Failed to create language channels on Discord for "${preview.categoryName}": ${discordResult.error}`,
      );
      res.status(502).json({ error: discordResult.error || 'Discord failed to create language channels.' });
      return;
    }

    const catId = `cat-lang-${code}`;
    let existingCategory = guild.discovery.categories.find((c) => c.name.toLowerCase() === preview.categoryName.toLowerCase());
    if (!existingCategory) {
      existingCategory = {
        id: catId,
        discordCategoryId: discordResult.categoryId,
        name: preview.categoryName,
        position: guild.discovery.categories.length + 1,
        isPrivateLeadership: false,
        discoveredFromExisting: true,
        lifecycleState: 'mapped',
        permissionOverwrites: [],
        channels: [],
      };
      guild.discovery.categories.push(existingCategory);
    } else if (discordResult.categoryId) {
      existingCategory.discordCategoryId = discordResult.categoryId;
      existingCategory.lifecycleState = 'mapped';
    }

    for (const ch of preview.channels) {
      const createdMatch = discordResult.created.find((c) => c.key === ch.key);
      const existingCh = existingCategory.channels.find((ec) => ec.name === ch.name);
      if (!existingCh) {
        const newChId = `ch-${code}-${ch.key}`;
        existingCategory.channels.push({
          id: newChId,
          discordChannelId: createdMatch?.channelId ?? null,
          name: ch.name,
          type: ch.type,
          categoryId: existingCategory.id,
          topic: `${lang.nativeName} ${ch.key} channel`,
          isPrivateLeadership: false,
          readOnlyForMembers: ch.readOnly,
          accessClassification: 'verified_member',
          languageCode: code,
          mappedRolePurpose: ch.key,
          discoveredFromExisting: true,
          required: false,
          permissionOverwrites: [],
          lifecycleState: 'mapped',
        });
      } else if (createdMatch?.channelId) {
        existingCh.discordChannelId = createdMatch.channelId;
        existingCh.lifecycleState = 'mapped';
      }
    }

    lang.categoryId = discordResult.categoryId ?? existingCategory.id;
    lang.channelsCreated = true;
    lang.createdChannels = discordResult.created;
    lang.enabled = true;
    lang.updatedAt = new Date().toISOString();

    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'channel_create',
      code,
      preview.categoryName,
      `Created ${discordResult.created.length} verified Discord channels under "${preview.categoryName}" and enabled ${lang.name}.`,
    );
    res.json({ language: lang, discovery: guild.discovery, liveDiscord: true });
  });

  app.post('/api/guild/:guildId/languages/:code/toggle', requireAuth('languages.manage', 'multilingual'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    const code = req.params.code.toLowerCase();
    const lang = guild?.languages.find((l) => l.code === code);
    if (!guild || !lang) {
      res.status(404).json({ error: 'Language not found' });
      return;
    }
    if (lang.isDefault && lang.enabled) {
      res.status(400).json({ error: 'Default language (English) cannot be disabled.' });
      return;
    }
    const nextEnabled = !lang.enabled;
    if (nextEnabled) {
      const report = calculateCompleteness(lang, guild.translations[code]);
      if (!report.readyForPublication) {
        res.status(400).json({ error: 'Complete and approve translations before enabling this language.' });
        return;
      }
    }
    // Disabling never deletes channels or translation resources
    lang.enabled = nextEnabled;
    lang.updatedAt = new Date().toISOString();
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      code,
      lang.name,
      `${nextEnabled ? 'Enabled' : 'Disabled (preserving channels & translations)'} language "${lang.name}".`,
    );
    res.json({ language: lang });
  });

  // Member update (clan rank hierarchy + independent language roles)
  app.patch('/api/guild/:guildId/members/:userId', requireAuth('members.edit'), async (req: AuthenticatedRequest, res) => {
    const parsed = memberUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid member update payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const member = guild?.members.find((m) => m.userId === req.params.userId);
    if (!guild || !member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    if (parsed.data.clanRank && parsed.data.clanRank !== member.clanRank) {
      if (!canAssignClanRank(req.sessionUser!.clanRank, parsed.data.clanRank)) {
        res.status(403).json({ error: `Your rank (${req.sessionUser!.clanRank ?? 'Unranked'}) cannot assign ${parsed.data.clanRank}.` });
        return;
      }
      const prevRank = member.clanRank;
      const changes: BotControlPayloadMap['member.applyRoleChanges']['changes'] = [
        {
          action: 'grant',
          roleName: parsed.data.clanRank,
          reason: `Clan rank updated by ${req.sessionUser!.username}`,
        },
      ];
      if (prevRank) {
        changes.push({
          action: 'remove',
          roleName: prevRank,
          reason: `Clan rank replaced with ${parsed.data.clanRank} by ${req.sessionUser!.username}`,
        });
      }
      const command = await dispatchBotCommand(
        guild.guildId,
        req.sessionUser!,
        'member.applyRoleChanges',
        { userId: member.userId, changes },
      );
      if (!command.ok) {
        res.status(command.status).json({ error: command.error });
        return;
      }
      if (!command.result.ok) {
        res.status(502).json({ error: command.result.error || `Failed to assign ${parsed.data.clanRank} on Discord.` });
        return;
      }
      member.clanRank = parsed.data.clanRank;
      member.hasClanRank = true;
    }

    if (parsed.data.languageCodes !== undefined) {
      const enabledCodes = guild.languages.filter((l) => l.enabled).map((l) => l.code);
      member.languageCodes = mergeIndependentLanguageRoles(member.languageCodes, parsed.data.languageCodes, enabledCodes);
    }
    if (parsed.data.gamingClasses !== undefined) member.gamingClasses = parsed.data.gamingClasses;
    if (parsed.data.notificationRoles !== undefined) member.notificationRoles = parsed.data.notificationRoles;
    if (parsed.data.verified !== undefined) member.verified = parsed.data.verified;
    if (parsed.data.customBio !== undefined) member.customBio = parsed.data.customBio;

    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'member_update',
      member.userId,
      member.username,
      `Updated profile/roles for ${member.username} (Rank: ${member.clanRank ?? 'Unranked'}, Languages: ${member.languageCodes.join(',') || 'none'}).`,
    );
    res.json({ member });
  });

  // Role Panels & Safe Publish
  app.post('/api/guild/:guildId/role-panels', requireAuth('roles.publish', 'roles'), async (req: AuthenticatedRequest, res) => {
    const parsed = rolePanelCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid role panel payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const panel = {
      id: `panel-${Date.now()}`,
      ...parsed.data,
      published: false,
      publishedAt: null,
    };
    guild.rolePanels.push(panel);
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'role_change',
      panel.id,
      panel.title,
      `Created role panel "${panel.title}" targeting #${panel.channelName}.`,
    );
    res.status(201).json({ panel });
  });

  app.post('/api/guild/:guildId/role-panels/:panelId/publish', requireAuth('roles.publish', 'roles'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    const panel = guild?.rolePanels.find((p) => p.id === req.params.panelId);
    if (!guild || !panel) {
      res.status(404).json({ error: 'Role panel not found' });
      return;
    }

    const command = await dispatchBotCommand(
      guild.guildId,
      req.sessionUser!,
      'rolePanel.publish',
      { panel },
    );
    if (!command.ok) {
      await recordDashboardAudit(
        guild.guildId,
        req.sessionUser!,
        'role_change',
        panel.id,
        panel.title,
        `Role panel publish for "${panel.title}" failed before completion: ${command.error}`,
      );
      res.status(command.status).json({ error: command.error });
      return;
    }

    const pubRes = command.result;
    if (!pubRes.ok) {
      await recordDashboardAudit(
        guild.guildId,
        req.sessionUser!,
        'role_change',
        panel.id,
        panel.title,
        `Failed /roles publish for "${panel.title}" in #${panel.channelName}: ${pubRes.error || 'Discord error'}`,
      );
      res.status(502).json({ error: pubRes.error || 'Discord failed to publish role panel.' });
      return;
    }

    panel.published = true;
    panel.publishedAt = new Date().toISOString();
    if (pubRes.messageId) panel.publishedMessageId = pubRes.messageId;
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'role_change',
      panel.id,
      panel.title,
      `Executed /roles publish for "${panel.title}" in #${panel.channelName} (liveDiscord=true, messageId=${panel.publishedMessageId ?? 'confirmed'}; zero server setup changes).`,
    );
    res.json({ panel, liveDiscord: true });
  });

  // Rules Gate Publishing & 5-Step Onboarding Status / Actions
  app.post('/api/guild/:guildId/rules/publish', requireAuth('roles.publish', 'onboarding'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    const command = await dispatchBotCommand(
      guild.guildId,
      req.sessionUser!,
      'rules.publish',
      {
        channelName: guild.onboarding.rulesChannelName,
        title: guild.onboarding.rulesTitle,
        body: guild.onboarding.rulesBody,
        reactionEmoji: guild.onboarding.rulesReactionEmoji || '✅',
      },
    );
    if (!command.ok) {
      await recordDashboardAudit(
        guild.guildId,
        req.sessionUser!,
        'config_change',
        guild.guildId,
        guild.onboarding.rulesChannelName,
        `Rules publish to #${guild.onboarding.rulesChannelName} failed before completion: ${command.error}`,
      );
      res.status(command.status).json({ error: command.error });
      return;
    }

    const pubRes = command.result;
    if (!pubRes.ok) {
      await recordDashboardAudit(
        guild.guildId,
        req.sessionUser!,
        'config_change',
        guild.guildId,
        guild.onboarding.rulesChannelName,
        `Failed to publish rules gate to #${guild.onboarding.rulesChannelName}: ${pubRes.error || 'Discord error'}`,
      );
      res.status(502).json({ error: pubRes.error || 'Discord failed to publish rules message.' });
      return;
    }

    const now = new Date().toISOString();
    if (pubRes.messageId) guild.onboarding.rulesMessageId = pubRes.messageId;
    guild.onboarding.rulesPublishedAt = now;
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      guild.guildId,
      guild.onboarding.rulesChannelName,
      `Published rules verification gate to #${guild.onboarding.rulesChannelName} (liveDiscord=true, messageId=${guild.onboarding.rulesMessageId ?? 'confirmed'}).`,
    );
    res.json({ onboarding: guild.onboarding, liveDiscord: true });
  });

  app.get('/api/guild/:guildId/onboarding', requireAuth('overview.view', 'onboarding'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    const roleNamesCommand = guild.members.length
      ? await dispatchBotCommand(
        guild.guildId,
        req.sessionUser!,
        'member.getRoleNames',
        { userIds: guild.members.map((member) => member.userId) },
      )
      : { ok: true as const, result: {} };
    const liveRoleNamesByUser = roleNamesCommand.ok ? roleNamesCommand.result : {};
    const statuses = await Promise.all(
      guild.members.map(async (member) => {
        const liveRoleNames = roleNamesCommand.ok ? liveRoleNamesByUser[member.userId] ?? null : null;
        const rec = guild.onboardingRecords.find((r) => r.userId === member.userId) ?? null;
        return computeMemberOnboardingStatus(member, liveRoleNames, rec);
      }),
    );

    res.json({
      onboarding: guild.onboarding,
      statuses,
      liveDiscord: roleNamesCommand.ok,
    });
  });

  app.post('/api/guild/:guildId/onboarding/:userId/verify-rules', requireAuth('members.edit', 'onboarding'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    const member = guild?.members.find((m) => m.userId === req.params.userId);
    if (!guild || !member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const added = req.body?.verified !== false;
    const roleName = guild.onboarding.verifiedRoleName || '✅ Verified';
    const command = await dispatchBotCommand(
      guild.guildId,
      req.sessionUser!,
      'member.applyRoleChanges',
      {
        userId: member.userId,
        changes: [{
          action: added ? 'grant' : 'remove',
          roleName,
          reason: added
            ? `Dashboard rules verification by ${req.sessionUser!.username}`
            : `Dashboard rules verification revoked by ${req.sessionUser!.username}`,
        }],
      },
    );
    if (!command.ok) {
      res.status(command.status).json({ error: command.error });
      return;
    }
    if (!command.result.ok) {
      res.status(502).json({ error: command.result.error || `Failed to update ${roleName} on Discord.` });
      return;
    }

    const outcome = applyRulesVerificationReaction(guild, {
      userId: member.userId,
      username: member.username,
      added,
    });

    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'role_change',
      member.userId,
      member.username,
      `${added ? 'Verified' : 'Revoked'} rules acceptance (✅ Verified) on Discord for ${member.username}; unrelated roles preserved.`,
    );
    res.json({ member, record: outcome.record, verified: outcome.verified, liveDiscord: true });
  });

  app.post('/api/guild/:guildId/onboarding/:userId/active-player', requireAuth('members.edit', 'onboarding'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    const member = guild?.members.find((m) => m.userId === req.params.userId);
    if (!guild || !member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const roleNamesCommand = await dispatchBotCommand(
      guild.guildId,
      req.sessionUser!,
      'member.getRoleNames',
      { userIds: [member.userId] },
    );
    if (!roleNamesCommand.ok) {
      res.status(roleNamesCommand.status).json({ error: roleNamesCommand.error });
      return;
    }
    const liveRoleNames = roleNamesCommand.result[member.userId] ?? null;

    const cloned = JSON.parse(JSON.stringify(guild)) as GuildState;
    const result = grantActivePlayerRecruit(cloned, {
      userId: member.userId,
      username: member.username,
      actualDiscordRoleNames: liveRoleNames,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.reason, status: result.status });
      return;
    }

    if (result.grantedRole) {
      const grantCommand = await dispatchBotCommand(
        guild.guildId,
        req.sessionUser!,
        'member.applyRoleChanges',
        {
          userId: member.userId,
          changes: [{
            action: 'grant',
            roleName: result.grantedRole,
            reason: `Active-player onboarding confirmed by ${req.sessionUser!.username}`,
          }],
        },
      );
      if (!grantCommand.ok) {
        res.status(grantCommand.status).json({ error: grantCommand.error });
        return;
      }
      if (!grantCommand.result.ok) {
        res.status(502).json({ error: grantCommand.result.error || 'Discord failed to grant 🌱 Recruit.' });
        return;
      }
    }

    await db.saveGuild(cloned);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'role_change',
      member.userId,
      member.username,
      result.reason,
    );
    const updatedMember = cloned.members.find((m) => m.userId === member.userId) ?? member;
    res.json({ ok: true, reason: result.reason, status: result.status, member: updatedMember, liveDiscord: true });
  });

  // Moderation & Appeals
  app.post('/api/guild/:guildId/moderation', requireAuth('moderation.execute', 'moderation'), async (req: AuthenticatedRequest, res) => {
    const parsed = moderationActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid moderation payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const targetMember = guild.members.find((m) => m.userId === parsed.data.targetUserId);
    if (targetMember && !canActOnTargetRank(req.sessionUser!.clanRank, targetMember.clanRank)) {
      res.status(403).json({ error: `Hierarchy check blocked action against ${targetMember.clanRank ?? 'target'}.` });
      return;
    }

    const now = new Date().toISOString();
    const durationMinutes = parsed.data.durationMinutes ?? null;
    const expiresAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60_000).toISOString() : null;
    const command = await dispatchBotCommand(
      guild.guildId,
      req.sessionUser!,
      'moderation.execute',
      {
        action: parsed.data.action,
        targetUserId: parsed.data.targetUserId,
        reason: parsed.data.reason,
        durationMinutes,
        channelName: parsed.data.channelName ?? '💬・general-chat',
      },
    );
    if (!command.ok) {
      await recordDashboardAudit(
        guild.guildId,
        req.sessionUser!,
        'moderation',
        parsed.data.targetUserId,
        parsed.data.targetUsername,
        `Dashboard ${parsed.data.action} against ${parsed.data.targetUsername} failed before completion: ${command.error}`,
      );
      res.status(command.status).json({ error: command.error });
      return;
    }

    const execRes = command.result;

    const discordExecutionStatus: 'verified_live' | 'failed' = execRes.ok ? 'verified_live' : 'failed';
    const discordError = execRes.ok ? null : execRes.error || 'Discord API rejected moderation operation.';

    guild.caseSequence += 1;
    const caseId = `CASE-${String(guild.caseSequence).padStart(4, '0')}`;

    const modCase = {
      caseId,
      sequence: guild.caseSequence,
      guildId: guild.guildId,
      action: parsed.data.action,
      targetUserId: parsed.data.targetUserId,
      targetUsername: parsed.data.targetUsername,
      moderatorUserId: req.sessionUser!.userId,
      moderatorUsername: req.sessionUser!.username,
      reason: parsed.data.reason,
      durationMinutes,
      expiresAt,
      active: discordExecutionStatus === 'verified_live' && !['untimeout', 'unban', 'unlock'].includes(parsed.data.action),
      channelName: parsed.data.channelName ?? null,
      discordExecutionStatus,
      discordError,
      createdAt: now,
    };
    guild.moderationCases.unshift(modCase);

    if (discordExecutionStatus === 'verified_live') {
      if (parsed.data.action === 'warn') {
        guild.warnings.unshift({
          id: `warn-${Date.now()}`,
          caseId,
          userId: parsed.data.targetUserId,
          username: parsed.data.targetUsername,
          moderatorUsername: req.sessionUser!.username,
          reason: parsed.data.reason,
          active: true,
          createdAt: now,
        });
      }

      if (parsed.data.action === 'tempban' && expiresAt) {
        guild.scheduledTasks.push({
          id: `task-tempban-${caseId}`,
          guildId: guild.guildId,
          type: 'tempban_expiry',
          targetId: caseId,
          description: `Auto-expire tempban ${caseId} for ${parsed.data.targetUsername}`,
          runAt: expiresAt,
          status: 'pending',
          attempts: 0,
          lastError: null,
          completedAt: null,
          createdAt: now,
        });
      }
    }

    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'moderation',
      parsed.data.targetUserId,
      parsed.data.targetUsername,
      discordExecutionStatus === 'failed'
        ? `${caseId}: FAILED ${parsed.data.action} on ${parsed.data.targetUsername} — ${discordError}`
        : `${caseId} (verified_live): ${parsed.data.action} on ${parsed.data.targetUsername} — ${parsed.data.reason}`,
    );

    if (discordExecutionStatus === 'failed') {
      res.status(502).json({ error: discordError, modCase });
      return;
    }
    res.status(201).json({ modCase });
  });

  app.post('/api/guild/:guildId/appeals/:appealId/review', requireAuth('moderation.execute', 'moderation'), async (req: AuthenticatedRequest, res) => {
    const parsed = appealReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid appeal review payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const appeal = guild?.appeals.find((a) => a.id === req.params.appealId);
    if (!guild || !appeal) {
      res.status(404).json({ error: 'Appeal not found' });
      return;
    }
    appeal.status = parsed.data.status;
    appeal.reviewerUsername = req.sessionUser!.username;
    appeal.reviewNotes = parsed.data.reviewNotes;
    appeal.reviewedAt = new Date().toISOString();

    if (parsed.data.status === 'approved') {
      const linkedCase = guild.moderationCases.find((c) => c.caseId === appeal.caseId);
      if (linkedCase) linkedCase.active = false;
    }

    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'moderation',
      appeal.caseId,
      appeal.username,
      `Appeal for ${appeal.caseId} marked ${parsed.data.status} by ${req.sessionUser!.username}.`,
    );
    res.json({ appeal });
  });

  // AutoMod config & deterministic rule simulator
  app.put('/api/guild/:guildId/automod', requireAuth('automod.manage', 'automod'), async (req: AuthenticatedRequest, res) => {
    const parsed = automodUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid AutoMod settings' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    guild.automod = { ...parsed.data, neverAutoPermaban: true };
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'automod',
      guild.guildId,
      guild.guildName,
      `Updated rule-based AutoMod configuration (Emergency Lockdown: ${guild.automod.emergencyLockdown ? 'ON' : 'OFF'}).`,
    );
    res.json({ automod: guild.automod });
  });

  app.post('/api/guild/:guildId/automod/test', requireAuth('automod.manage', 'automod'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const evaluation = automodEngine.evaluateMessage(guild.automod, {
      userId: 'sim-test-user',
      username: String(req.body?.username || 'TestRecruit'),
      content: String(req.body?.content || ''),
      channelName: String(req.body?.channelName || '💬・general-chat'),
      userRoles: Array.isArray(req.body?.userRoles) ? req.body.userRoles : ['🌱 Recruit'],
      mentionCount: Number(req.body?.mentionCount || 0),
    });
    res.json({ evaluation });
  });

  // AutoMod False-Positive Reports
  app.post('/api/guild/:guildId/automod/false-positives', requireAuth('overview.view', 'automod'), async (req: AuthenticatedRequest, res) => {
    const parsed = falsePositiveCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid false-positive report payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const report = {
      id: `fp-${Date.now()}`,
      reporterUserId: req.sessionUser!.userId,
      reporterUsername: req.sessionUser!.username,
      channelName: parsed.data.channelName,
      sampleContent: parsed.data.sampleContent,
      ruleHits: parsed.data.ruleHits,
      notes: parsed.data.notes,
      status: 'open' as const,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
    };
    guild.falsePositiveReports.unshift(report);
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'automod',
      report.id,
      report.ruleHits.join(', ') || 'automod',
      `Submitted AutoMod false-positive report in #${report.channelName}.`,
    );
    res.status(201).json({ report });
  });

  app.patch('/api/guild/:guildId/automod/false-positives/:id', requireAuth('automod.manage', 'automod'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    const report = guild?.falsePositiveReports.find((r) => r.id === req.params.id);
    if (!guild || !report) {
      res.status(404).json({ error: 'False-positive report not found' });
      return;
    }
    const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
    report.status = status;
    report.reviewedBy = req.sessionUser!.username;
    report.reviewedAt = new Date().toISOString();
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'automod',
      report.id,
      report.ruleHits.join(', ') || 'automod',
      `Marked AutoMod false-positive report ${report.id} as ${status}.`,
    );
    res.json({ report });
  });

  // Deterministic Custom Responses (Zero AI)
  app.post('/api/guild/:guildId/custom-responses', requireAuth('community.manage', 'community'), async (req: AuthenticatedRequest, res) => {
    const parsed = customResponseCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid custom response payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const rule = {
      id: `cr-${Date.now()}`,
      trigger: parsed.data.trigger,
      matchMode: parsed.data.matchMode,
      response: parsed.data.response,
      enabled: true,
      languageCode: parsed.data.languageCode ?? null,
      createdBy: req.sessionUser!.username,
      createdAt: new Date().toISOString(),
    };
    guild.customResponses.unshift(rule);
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      rule.id,
      rule.trigger,
      `Added deterministic custom response for "${rule.trigger}" (${rule.matchMode}).`,
    );
    res.status(201).json({ rule });
  });

  app.delete('/api/guild/:guildId/custom-responses/:id', requireAuth('community.manage', 'community'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const before = guild.customResponses.length;
    guild.customResponses = guild.customResponses.filter((r) => r.id !== req.params.id);
    if (guild.customResponses.length === before) {
      res.status(404).json({ error: 'Custom response not found' });
      return;
    }
    await db.saveGuild(guild);
    res.json({ removed: true });
  });

  // Logging Config
  app.put('/api/guild/:guildId/logging/config', requireAuth('logging.manage', 'logging'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    if (typeof req.body?.enabled === 'boolean') guild.logging.enabled = req.body.enabled;
    if (typeof req.body?.retentionDays === 'number' && req.body.retentionDays >= 7 && req.body.retentionDays <= 365) {
      guild.logging.retentionDays = req.body.retentionDays;
    }
    if (req.body?.channels && typeof req.body.channels === 'object') {
      guild.logging.channels = { ...guild.logging.channels, ...req.body.channels };
    }
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      guild.guildId,
      'Logging Config',
      `Updated log retention (${guild.logging.retentionDays} days) and channel routing.`,
    );
    res.json({ logging: guild.logging });
  });

  // Tickets
  app.post('/api/guild/:guildId/tickets', requireAuth('tickets.view', 'tickets'), async (req: AuthenticatedRequest, res) => {
    const parsed = ticketCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid ticket payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const now = new Date().toISOString();
    guild.ticketSequence += 1;
    const num = guild.ticketSequence;
    const ticket = {
      id: `ticket-${num}`,
      ticketNumber: num,
      category: parsed.data.category,
      subject: parsed.data.subject,
      creatorUserId: req.sessionUser!.userId,
      creatorUsername: req.sessionUser!.username,
      status: 'open' as const,
      claimedByUserId: null,
      claimedByUsername: null,
      channelName: `ticket-${String(num).padStart(4, '0')}`,
      feedbackRating: null,
      feedbackComment: null,
      messages: [
        {
          id: `tm-${Date.now()}`,
          authorId: req.sessionUser!.userId,
          authorName: req.sessionUser!.username,
          authorRole: req.sessionUser!.clanRank ?? 'Unranked',
          content: parsed.data.initialMessage,
          createdAt: now,
        },
      ],
      createdAt: now,
      closedAt: null,
    };
    guild.tickets.unshift(ticket);
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'ticket',
      ticket.id,
      `Ticket #${num}`,
      `Opened ticket #${num} (${ticket.category}): ${ticket.subject}`,
    );
    res.status(201).json({ ticket });
  });

  app.post('/api/guild/:guildId/tickets/:ticketId/messages', requireAuth('tickets.view', 'tickets'), async (req: AuthenticatedRequest, res) => {
    const parsed = ticketMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Message content is required.' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const ticket = guild?.tickets.find((t) => t.id === req.params.ticketId);
    if (!guild || !ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    if (ticket.status === 'closed') {
      res.status(400).json({ error: 'Reopen ticket before posting new messages.' });
      return;
    }
    ticket.messages.push({
      id: `tm-${Date.now()}`,
      authorId: req.sessionUser!.userId,
      authorName: req.sessionUser!.username,
      authorRole: req.sessionUser!.clanRank ?? 'Unranked',
      content: parsed.data.content,
      createdAt: new Date().toISOString(),
    });
    await db.saveGuild(guild);
    res.json({ ticket });
  });

  app.post('/api/guild/:guildId/tickets/:ticketId/action', requireAuth('tickets.manage', 'tickets'), async (req: AuthenticatedRequest, res) => {
    const parsed = ticketActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ticket action' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const ticket = guild?.tickets.find((t) => t.id === req.params.ticketId);
    if (!guild || !ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    const now = new Date().toISOString();
    if (parsed.data.action === 'claim') {
      ticket.status = 'claimed';
      ticket.claimedByUserId = req.sessionUser!.userId;
      ticket.claimedByUsername = req.sessionUser!.username;
    } else if (parsed.data.action === 'transfer') {
      ticket.status = 'claimed';
      ticket.claimedByUserId = parsed.data.transferToUserId || 'u-102';
      ticket.claimedByUsername = parsed.data.transferToUsername || 'LyraDawn';
    } else if (parsed.data.action === 'close') {
      ticket.status = 'closed';
      ticket.closedAt = now;
    } else if (parsed.data.action === 'reopen') {
      ticket.status = 'open';
      ticket.closedAt = null;
    } else if (parsed.data.action === 'feedback') {
      ticket.feedbackRating = parsed.data.feedbackRating ?? 5;
      ticket.feedbackComment = parsed.data.feedbackComment ?? '';
    }
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'ticket',
      ticket.id,
      `Ticket #${ticket.ticketNumber}`,
      `Ticket #${ticket.ticketNumber} action: ${parsed.data.action}`,
    );
    res.json({ ticket });
  });

  // Recruitment
  app.post('/api/guild/:guildId/recruitment/apply', requireAuth('overview.view', 'recruitment'), async (req: AuthenticatedRequest, res) => {
    const parsed = recruitmentSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid application payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const form = guild?.recruitmentForms.find((f) => f.id === parsed.data.formId);
    if (!guild || !form) {
      res.status(404).json({ error: 'Recruitment form not found' });
      return;
    }
    const application = {
      id: `app-${Date.now()}`,
      formId: form.id,
      category: form.category,
      applicantUserId: req.sessionUser!.userId,
      applicantUsername: req.sessionUser!.username,
      answers: parsed.data.answers,
      status: 'pending' as const,
      reviewerUserId: null,
      reviewerUsername: null,
      reviewNotes: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    };
    guild.recruitmentApplications.unshift(application);
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'recruitment',
      application.id,
      form.title,
      `Submitted ${form.category} recruitment application.`,
    );
    res.status(201).json({ application });
  });

  app.post('/api/guild/:guildId/recruitment/:appId/review', requireAuth('recruitment.review', 'recruitment'), async (req: AuthenticatedRequest, res) => {
    const parsed = recruitmentReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid review payload' });
      return;
    }
    const guild = await db.getGuild(req.params.guildId);
    const application = guild?.recruitmentApplications.find((a) => a.id === req.params.appId);
    if (!guild || !application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    application.status = parsed.data.status;
    application.reviewerUserId = req.sessionUser!.userId;
    application.reviewerUsername = req.sessionUser!.username;
    application.reviewNotes = parsed.data.reviewNotes;
    application.reviewedAt = new Date().toISOString();
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'recruitment',
      application.id,
      application.applicantUsername,
      `Recruitment application from ${application.applicantUsername} marked ${parsed.data.status}.`,
    );
    res.json({ application });
  });

  // Community features
  app.post('/api/guild/:guildId/community/suggestions', requireAuth('overview.view', 'community'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    if (title.length < 3 || description.length < 5) {
      res.status(400).json({ error: 'Title and description are required.' });
      return;
    }
    const item = {
      id: `sug-${Date.now()}`,
      authorId: req.sessionUser!.userId,
      authorName: req.sessionUser!.username,
      title,
      description,
      status: 'open' as const,
      upvotes: [req.sessionUser!.userId],
      downvotes: [],
      createdAt: new Date().toISOString(),
    };
    guild.suggestions.unshift(item);
    await db.saveGuild(guild);
    res.status(201).json({ suggestion: item });
  });

  app.post('/api/guild/:guildId/community/suggestions/:id/vote', requireAuth('overview.view', 'community'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    const sug = guild?.suggestions.find((s) => s.id === req.params.id);
    if (!guild || !sug) {
      res.status(404).json({ error: 'Suggestion not found' });
      return;
    }
    const uid = req.sessionUser!.userId;
    const dir = req.body?.direction === 'down' ? 'down' : 'up';
    sug.upvotes = sug.upvotes.filter((id) => id !== uid);
    sug.downvotes = sug.downvotes.filter((id) => id !== uid);
    if (dir === 'up') sug.upvotes.push(uid);
    else sug.downvotes.push(uid);
    await db.saveGuild(guild);
    res.json({ suggestion: sug });
  });

  app.post('/api/guild/:guildId/community/polls', requireAuth('community.manage', 'community'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const question = String(req.body?.question || '').trim();
    const optionsRaw: string[] = Array.isArray(req.body?.options) ? req.body.options : [];
    const options = optionsRaw.map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
    if (question.length < 3 || options.length < 2) {
      res.status(400).json({ error: 'Question and at least 2 options are required.' });
      return;
    }
    const poll = {
      id: `poll-${Date.now()}`,
      question,
      authorName: req.sessionUser!.username,
      options: options.map((label, idx) => ({ id: `opt-${idx + 1}`, label, voterIds: [] })),
      closed: false,
      endsAt: new Date(Date.now() + 86400_000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    guild.polls.unshift(poll);
    await db.saveGuild(guild);
    res.status(201).json({ poll });
  });

  app.post('/api/guild/:guildId/community/polls/:id/vote', requireAuth('overview.view', 'community'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    const poll = guild?.polls.find((p) => p.id === req.params.id);
    if (!guild || !poll) {
      res.status(404).json({ error: 'Poll not found' });
      return;
    }
    const optionId = String(req.body?.optionId || '');
    const uid = req.sessionUser!.userId;
    for (const opt of poll.options) {
      opt.voterIds = opt.voterIds.filter((id) => id !== uid);
      if (opt.id === optionId) opt.voterIds.push(uid);
    }
    await db.saveGuild(guild);
    res.json({ poll });
  });

  app.post('/api/guild/:guildId/community/giveaways', requireAuth('community.manage', 'community'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const prize = String(req.body?.prize || '').trim();
    const minutes = Math.max(1, Number(req.body?.minutes || 60));
    if (prize.length < 2) {
      res.status(400).json({ error: 'Giveaway prize is required.' });
      return;
    }
    const now = new Date().toISOString();
    const endsAt = new Date(Date.now() + minutes * 60_000).toISOString();
    const gw = {
      id: `giveaway-${Date.now()}`,
      prize,
      hostName: req.sessionUser!.username,
      winnerCount: Math.max(1, Math.min(10, Number(req.body?.winnerCount || 1))),
      entrants: [],
      winnerIds: [],
      status: 'active' as const,
      endsAt,
      createdAt: now,
    };
    guild.giveaways.unshift(gw);
    guild.scheduledTasks.push({
      id: `task-${gw.id}`,
      guildId: guild.guildId,
      type: 'giveaway_draw',
      targetId: gw.id,
      description: `Draw winner for ${prize}`,
      runAt: endsAt,
      status: 'pending',
      attempts: 0,
      lastError: null,
      completedAt: null,
      createdAt: now,
    });
    await db.saveGuild(guild);
    res.status(201).json({ giveaway: gw });
  });

  app.post('/api/guild/:guildId/community/events', requireAuth('community.manage', 'community'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || 'Community assembly').trim();
    if (title.length < 3) {
      res.status(400).json({ error: 'Event title is required.' });
      return;
    }
    const rawEventType = String(req.body?.eventType || 'community');
    if (!['raid', 'dungeon', 'community', 'tournament'].includes(rawEventType)) {
      res.status(400).json({ error: 'Choose a valid event type.' });
      return;
    }
    const eventType = rawEventType as 'raid' | 'dungeon' | 'community' | 'tournament';
    const gameId = String(req.body?.gameId || '');
    if (gameId && !guild.games.some((game) => game.id === gameId)) {
      res.status(400).json({ error: 'Select a configured game for this event.' });
      return;
    }
    if ((eventType === 'raid' || eventType === 'dungeon') && !gameId) {
      res.status(400).json({ error: 'Add a game before scheduling a raid or dungeon.' });
      return;
    }
    const ev = {
      id: `event-${Date.now()}`,
      title,
      description,
      eventType,
      gameId,
      hostName: req.sessionUser!.username,
      startsAt: String(req.body?.startsAt || new Date(Date.now() + 86400_000).toISOString()),
      maxParticipants: req.body?.maxParticipants ? Number(req.body.maxParticipants) : null,
      rsvps: [{ userId: req.sessionUser!.userId, username: req.sessionUser!.username, status: 'going' as const, roleClass: null }],
      createdAt: new Date().toISOString(),
    };
    guild.events.unshift(ev);
    await db.saveGuild(guild);
    res.status(201).json({ event: ev });
  });

  app.post('/api/guild/:guildId/community/announcements', requireAuth('community.manage', 'community'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const channelName = String(req.body?.channelName || 'announcements').trim();
    const languageCode = String(req.body?.languageCode || 'en').trim();
    const minutesDelay = Math.max(1, Number(req.body?.minutesDelay || 15));
    if (title.length < 2 || content.length < 3) {
      res.status(400).json({ error: 'Title and content are required.' });
      return;
    }
    const now = new Date().toISOString();
    const scheduledFor = new Date(Date.now() + minutesDelay * 60_000).toISOString();
    const ann = {
      id: `ann-${Date.now()}`,
      title,
      channelName,
      languageCode,
      content,
      scheduledFor,
      sent: false,
      createdBy: req.sessionUser!.username,
    };
    guild.scheduledAnnouncements.unshift(ann);
    guild.scheduledTasks.push({
      id: `task-${ann.id}`,
      guildId: guild.guildId,
      type: 'scheduled_announcement',
      targetId: ann.id,
      description: `Publish "${title}" to #${channelName}`,
      runAt: scheduledFor,
      status: 'pending',
      attempts: 0,
      lastError: null,
      completedAt: null,
      createdAt: now,
    });
    await db.saveGuild(guild);
    res.status(201).json({ announcement: ann });
  });

  // Clan & Gaming Management (game-agnostic)
  app.post('/api/guild/:guildId/clan/games', requireAuth('clan.manage', 'clan'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const name = String(req.body?.name || '').trim();
    const shortCode = String(req.body?.shortCode || '').trim().toUpperCase();
    if (name.length < 2 || shortCode.length < 2) {
      res.status(400).json({ error: 'Game name and short code are required.' });
      return;
    }
    if (name.length > 80 || shortCode.length > 12) {
      res.status(400).json({ error: 'Game name must be at most 80 characters and code at most 12.' });
      return;
    }
    if (guild.games.some((item) => item.name.toLowerCase() === name.toLowerCase() || item.shortCode.toLowerCase() === shortCode.toLowerCase())) {
      res.status(409).json({ error: 'A game with that name or code already exists.' });
      return;
    }
    const game = { id: `game-${Date.now()}`, name, shortCode, active: true, ranks: [] };
    guild.games.push(game);
    await db.saveGuild(guild);
    res.status(201).json({ game });
  });

  app.patch('/api/guild/:guildId/clan/games/:gameId', requireAuth('clan.manage', 'clan'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const game = guild.games.find((item) => item.id === req.params.gameId);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const hasRanks = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'ranks');
    const hasClasses = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'classes');
    if (!hasRanks && !hasClasses) {
      res.status(400).json({ error: 'Provide game ranks or classes to update.' });
      return;
    }
    const currentClasses = guild.gamingClasses.filter((item) => item.gameId === game.id);
    const ranks = hasRanks ? normalizeGameLabels(req.body.ranks) : game.ranks ?? [];
    const classes = hasClasses ? normalizeGameLabels(req.body.classes) : currentClasses.map((item) => item.name);
    if (!ranks || !classes) {
      res.status(400).json({ error: 'Game ranks and classes must be unique names of 1–50 characters, with no more than 50 of each.' });
      return;
    }

    game.ranks = ranks;
    if (hasClasses) {
      const currentByName = new Map(currentClasses.map((item) => [item.name.toLowerCase(), item]));
      guild.gamingClasses = [
        ...guild.gamingClasses.filter((item) => item.gameId !== game.id),
        ...classes.map((name, index) => {
          const current = currentByName.get(name.toLowerCase());
          return current ? { ...current, name } : { id: `${game.id}-class-${Date.now()}-${index}`, gameId: game.id, name };
        }),
      ];
    }
    await db.saveGuild(guild);
    res.json({ game });
  });

  app.post('/api/guild/:guildId/clan/teams', requireAuth('clan.manage', 'clan'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const gameId = String(req.body?.gameId || '');
    if (name.length < 2) {
      res.status(400).json({ error: 'Team name is required.' });
      return;
    }
    if (!guild.games.some((item) => item.id === gameId)) {
      res.status(400).json({ error: 'Select a configured game before creating a team.' });
      return;
    }
    const team = {
      id: `team-${Date.now()}`,
      name,
      gameId,
      leaderUserId: req.sessionUser!.userId,
      leaderUsername: req.sessionUser!.username,
      memberIds: [req.sessionUser!.userId],
      description: description || 'Clan combat squad',
      maxSize: Math.max(2, Math.min(40, Number(req.body?.maxSize || 10))),
    };
    guild.teams.push(team);
    await db.saveGuild(guild);
    res.status(201).json({ team });
  });

  app.post('/api/guild/:guildId/clan/raids', requireAuth('clan.manage', 'clan'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const title = String(req.body?.title || '').trim();
    const kind = req.body?.kind === 'dungeon' ? 'dungeon' : 'raid';
    const gameId = String(req.body?.gameId || '');
    if (title.length < 2) {
      res.status(400).json({ error: 'Raid/Dungeon title is required.' });
      return;
    }
    if (!guild.games.some((item) => item.id === gameId)) {
      res.status(400).json({ error: 'Select a configured game before scheduling a raid or dungeon.' });
      return;
    }
    const raid = {
      id: `raid-${Date.now()}`,
      title,
      kind: kind as 'raid' | 'dungeon',
      gameId,
      teamId: req.body?.teamId ? String(req.body.teamId) : null,
      leaderUsername: req.sessionUser!.username,
      scheduledFor: String(req.body?.scheduledFor || new Date(Date.now() + 86400_000).toISOString()),
      status: 'scheduled' as const,
      attendance: [{ userId: req.sessionUser!.userId, username: req.sessionUser!.username, state: 'present' as const }],
    };
    guild.raidSchedules.unshift(raid);
    await db.saveGuild(guild);
    res.status(201).json({ raid });
  });

  // Manual scheduler tick
  app.post('/api/guild/:guildId/scheduler/tick', requireAuth('settings.manage'), async (_req, res) => {
    res.status(503).json({ error: 'The persistent scheduler is owned by the bot process; API-triggered ticks are unavailable.' });
  });

  // Settings & Modules
  app.patch('/api/guild/:guildId/settings', requireAuth('settings.manage'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    if (req.body?.modules && typeof req.body.modules === 'object') {
      guild.modules = { ...guild.modules, ...req.body.modules };
    }
    if (req.body?.onboarding && typeof req.body.onboarding === 'object') {
      guild.onboarding = { ...guild.onboarding, ...req.body.onboarding };
    }
    if (req.body?.progression && typeof req.body.progression === 'object') {
      guild.progression = { ...guild.progression, ...req.body.progression };
    }
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      guild.guildId,
      'Guild Settings',
      'Updated guild module, onboarding, or progression settings.',
    );
    res.json({ guild });
  });

  // Slash Command Simulator / Executor
  app.post('/api/guild/:guildId/commands/execute', requireAuth('overview.view'), async (req: AuthenticatedRequest, res) => {
    const parsed = commandExecuteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid command payload' });
      return;
    }
    const command = await dispatchBotCommand(
      req.params.guildId,
      req.sessionUser!,
      'command.execute',
      {
        command: parsed.data.command,
        actorUserId: req.sessionUser!.userId,
        actorUsername: req.sessionUser!.username,
        actorRank: req.sessionUser!.clanRank,
        locale: 'en',
        channelName: parsed.data.channelName,
        args: parsed.data.args,
      },
    );
    if (!command.ok) {
      res.status(command.status).json({ error: command.error });
      return;
    }
    res.json({ result: command.result });
  });

  // Backup Export
  app.get(
    '/api/guild/:guildId/backup',
    rateLimit(10, 60_000),
    requireAuth('settings.manage'),
    async (req, res) => {
      const backup = await createGuildBackupExport(req.params.guildId, (guildId) => db.getGuild(guildId));
      if (!backup) {
        res.status(404).json({ error: 'Guild not found' });
        return;
      }
      res.json(backup);
    },
  );

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`[ShadowSlayers] Trusted API listening on http://0.0.0.0:${env.port} (adapter=${db.driverName})`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[ShadowSlayers] ${signal} received; closing API resources.`);
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    } finally {
      await db.close?.();
    }
  };
  process.once('SIGINT', () => {
    void shutdown('SIGINT').catch((err) => {
      console.error('[ShadowSlayers] API shutdown failed:', err);
      process.exitCode = 1;
    });
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM').catch((err) => {
      console.error('[ShadowSlayers] API shutdown failed:', err);
      process.exitCode = 1;
    });
  });
}

bootstrap().catch((err) => {
  console.error('[ShadowSlayers] Fatal startup error:', err);
  process.exit(1);
});
