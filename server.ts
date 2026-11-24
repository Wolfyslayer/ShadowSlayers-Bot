import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { loadEnv } from './packages/config/src/env.ts';
import { createDatabaseAdapter } from './packages/database/src/adapter.ts';
import {
  calculateCompleteness,
  createLanguageDraft,
  previewLanguageChannels,
} from './packages/localization/src/engine.ts';
import {
  canActOnTargetRank,
  canAssignClanRank,
  getCapabilitiesForRank,
  hasCapability,
  mergeIndependentLanguageRoles,
  type PermissionCapability,
} from './packages/permissions/src/hierarchy.ts';
import { resolveAuthorizedDiscordOAuthSession } from './packages/permissions/src/oauth-authz.ts';
import type { AuthUserSession, LogCategory } from './packages/shared/src/types.ts';
import {
  appealReviewSchema,
  automodUpdateSchema,
  commandExecuteSchema,
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
import { ShadowSlayersBotClient } from './apps/bot/src/index.ts';
import { SLASH_COMMANDS, executeSlashCommand } from './apps/bot/src/commands/registry.ts';
import { RuleBasedAutoModEngine } from './apps/bot/src/services/automod.ts';
import { PersistentTaskScheduler } from './apps/bot/src/services/scheduler.ts';

interface AuthenticatedRequest extends Request {
  sessionUser?: AuthUserSession;
}

const env = loadEnv();
const SESSION_KEY = env.sessionSecret || crypto.randomBytes(32).toString('hex');
const oauthStates = new Map<string, { createdAt: number }>();
const rateLimitBuckets = new Map<string, number[]>();

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
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hashPasswordScrypt(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPasswordScrypt(password: string, salt: string, storedHex: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const list = (rateLimitBuckets.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= maxRequests) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait briefly before retrying.' });
      return;
    }
    list.push(now);
    rateLimitBuckets.set(ip, list);
    next();
  };
}

async function bootstrap() {
  const db = createDatabaseAdapter(env.databaseAdapter, env.localDbPath, env.discordGuildId);
  await db.init();

  const scheduler = new PersistentTaskScheduler(db);
  scheduler.start(30_000);

  const botClient = new ShadowSlayersBotClient(db, env.discordGuildId);
  void botClient.start(env.discordBotToken, env.discordClientId);

  const automodEngine = new RuleBasedAutoModEngine();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

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

  const requireAuth = (capability?: PermissionCapability) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
      if (capability && !hasCapability(session.clanRank, capability)) {
        res.status(403).json({ error: `Missing permission capability: ${capability}` });
        return;
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
      service: 'ShadowSlayers – Legends of Elements',
      databaseAdapter: db.driverName,
      bot: botClient.getStatus(),
      guildCount: guildIds.length,
      timestamp: new Date().toISOString(),
    });
  });

  // Auth status & claim availability
  app.get('/api/auth/status', async (_req, res) => {
    const adminAuth = await db.getAdminAuth();
    const envPasscodeConfigured = env.adminPasscode.trim().length > 0;
    const discordOAuthConfigured = Boolean(env.discordClientId && env.discordClientSecret);
    res.json({
      discordOAuthConfigured,
      envPasscodeConfigured,
      adminClaimed: Boolean(adminAuth) || envPasscodeConfigured,
      claimedUsername: adminAuth?.username ?? (envPasscodeConfigured ? '👑 Shadow King' : null),
    });
  });

  // One-time first-run admin claim (locks permanently once claimed or when ADMIN_PASSCODE is configured)
  app.post('/api/auth/claim-admin', rateLimit(10, 60_000), async (req, res) => {
    if (env.adminPasscode.trim().length > 0) {
      res.status(403).json({ error: 'Admin passcode is managed via server environment secret.' });
      return;
    }
    const existing = await db.getAdminAuth();
    if (existing) {
      res.status(409).json({ error: 'Administrator credentials have already been claimed.' });
      return;
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : 'ShadowKing';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
      return;
    }
    if (username.length < 2 || username.length > 40) {
      res.status(400).json({ error: 'Username must be between 2 and 40 characters.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPasswordScrypt(password, salt);
    await db.setAdminAuth({
      username,
      salt,
      passwordHash,
      claimedAt: new Date().toISOString(),
    });

    const session: AuthUserSession = {
      userId: 'u-101',
      username,
      avatarUrl: '/src/assets/images/avatar_shadow_king_1795519524578.jpg',
      provider: 'admin_passcode',
      clanRank: '👑 Shadow King',
      guildVerified: true,
      discordRoleIds: [],
      permissions: getCapabilitiesForRank('👑 Shadow King'),
      expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
    };

    const token = signSessionToken(session);
    res.status(201).json({ token, user: session });
  });

  // Admin passcode sign-in
  app.post('/api/auth/login', rateLimit(15, 60_000), async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      res.status(400).json({ error: 'Passcode is required.' });
      return;
    }

    let valid = false;
    let username = '👑 Shadow King';

    if (env.adminPasscode.trim().length > 0) {
      const a = Buffer.from(password);
      const b = Buffer.from(env.adminPasscode);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else {
      const adminAuth = await db.getAdminAuth();
      if (!adminAuth) {
        res.status(409).json({ error: 'Initial administrator account has not been claimed yet.' });
        return;
      }
      valid = verifyPasswordScrypt(password, adminAuth.salt, adminAuth.passwordHash);
      username = adminAuth.username;
    }

    if (!valid) {
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    const session: AuthUserSession = {
      userId: 'u-101',
      username,
      avatarUrl: '/src/assets/images/avatar_shadow_king_1795519524578.jpg',
      provider: 'admin_passcode',
      clanRank: '👑 Shadow King',
      guildVerified: true,
      discordRoleIds: [],
      permissions: getCapabilitiesForRank('👑 Shadow King'),
      expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
    };

    const token = signSessionToken(session);
    res.json({ token, user: session });
  });

  // Discord OAuth2 URL endpoint (Popup flow — opens Discord URL directly)
  app.get('/api/auth/discord/url', (_req, res) => {
    if (!env.discordClientId || !env.discordClientSecret) {
      res.status(503).json({
        error: 'Discord OAuth2 is not configured yet. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in server environment.',
      });
      return;
    }
    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, { createdAt: Date.now() });
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

  const handleDiscordCallback = async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    const stateEntry = state ? oauthStates.get(state) : undefined;
    const stateExpired = !stateEntry || Date.now() - stateEntry.createdAt > 5 * 60_000;
    if (!code || !state || stateExpired) {
      if (state) oauthStates.delete(state);
      res.status(400).send('Invalid or expired OAuth state.');
      return;
    }
    oauthStates.delete(state);

    if (!env.discordClientId || !env.discordClientSecret) {
      res.status(500).send('Discord OAuth2 credentials missing on server.');
      return;
    }

    const targetOrigin = JSON.stringify(env.appUrl);

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
      const userGuilds = (await guildsResp.json()) as Array<{ id: string }>;
      const userGuildIds = userGuilds.map((g) => g.id);

      // Fetch live guild member roles via Bot token whenever configured
      let liveMemberRoleIds: string[] | null = null;
      if (env.discordBotToken && env.discordGuildId && env.discordGuildId !== 'shadowslayers-primary') {
        const memberResp = await fetch(
          `https://discord.com/api/v10/guilds/${env.discordGuildId}/members/${discordUser.id}`,
          { headers: { Authorization: `Bot ${env.discordBotToken}` } },
        );
        if (memberResp.ok) {
          const memberJson = (await memberResp.json()) as { roles?: string[] };
          liveMemberRoleIds = Array.isArray(memberJson.roles) ? memberJson.roles : [];
        } else if (memberResp.status === 404) {
          liveMemberRoleIds = null;
        }
      }

      const guild = await db.getGuild(env.discordGuildId);
      const authz = resolveAuthorizedDiscordOAuthSession({
        discordUser,
        userGuildIds,
        targetGuildId: env.discordGuildId,
        liveMemberRoleIds,
        guildState: guild,
        explicitAuthorizedUserIds: env.adminDiscordUserIds,
      });

      if (!authz.authorized || !authz.session) {
        res.status(403).send(`<!doctype html><html><body style="background:#0B0D12;color:#fca5a5;font-family:sans-serif;padding:24px;">
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(authz.reason)} }, ${targetOrigin});
              window.close();
            }
          </script>
          <h3>Access Denied (403)</h3>
          <p>${authz.reason}</p>
        </body></html>`);
        return;
      }

      const sessionToken = signSessionToken(authz.session);
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
    } catch {
      res.status(500).send('OAuth callback processing failed.');
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], handleDiscordCallback);

  app.get('/api/auth/me', requireAuth(), (req: AuthenticatedRequest, res) => {
    res.json({ user: req.sessionUser });
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
      botStatus: botClient.getStatus(),
    });
  });

  // Discovery: Non-destructive rescan & explicit confirmation
  app.post('/api/guild/:guildId/discovery/rescan', requireAuth('discovery.view'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const liveRescanned = await botClient.rescanLiveGuild(guild.discovery);
    if (liveRescanned) {
      guild.discovery = liveRescanned;
    } else {
      guild.discovery.lastDiscoveredAt = new Date().toISOString();
    }
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      guild.guildId,
      guild.guildName,
      `Ran non-destructive server discovery (${guild.discovery.categories.length} categories, ${guild.discovery.roles.length} roles, liveDiscord=${Boolean(liveRescanned)}).`,
    );
    res.json({ discovery: guild.discovery, liveDiscord: Boolean(liveRescanned) });
  });

  app.post('/api/guild/:guildId/discovery/confirm', requireAuth('discovery.apply'), async (req: AuthenticatedRequest, res) => {
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
    const liveReport = await botClient.applySetupOnLiveGuild(guild.discovery, {
      mode,
      actorUsername: req.sessionUser!.username,
    });

    if (liveReport) {
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
          failures: liveReport.failures,
        },
      });
      return;
    }

    // No live Discord Gateway connected: mark confirmed ONLY (never falsely mark 'applied')
    const now = new Date().toISOString();
    for (const change of guild.discovery.proposedChanges) {
      if (change.status === 'proposed' || change.status === 'missing') {
        change.status = 'confirmed';
      }
    }
    guild.discovery.setupConfirmedBy = req.sessionUser!.username;
    guild.discovery.setupConfirmedAt = now;
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'config_change',
      guild.guildId,
      guild.guildName,
      'Confirmed additive setup plan in standby mode (Discord Gateway offline — no live server changes applied yet).',
    );
    res.json({ discovery: guild.discovery, executionMode: 'confirmed_awaiting_gateway' });
  });

  // Dynamic Language Management (Zero AI)
  app.post('/api/guild/:guildId/languages', requireAuth('languages.manage'), async (req: AuthenticatedRequest, res) => {
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
        colorHex: '#0EA5E9',
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

  app.patch('/api/guild/:guildId/languages/:code/translations', requireAuth('languages.manage'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/languages/:code/review', requireAuth('languages.approve'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/languages/:code/create-channels', requireAuth('languages.approve'), async (req: AuthenticatedRequest, res) => {
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
    const catId = `cat-lang-${code}`;
    let existingCategory = guild.discovery.categories.find((c) => c.name.toLowerCase() === preview.categoryName.toLowerCase());
    if (!existingCategory) {
      existingCategory = {
        id: catId,
        discordCategoryId: null,
        name: preview.categoryName,
        position: guild.discovery.categories.length + 1,
        isPrivateLeadership: false,
        discoveredFromExisting: false,
        lifecycleState: 'confirmed',
        permissionOverwrites: [],
        channels: [],
      };
      guild.discovery.categories.push(existingCategory);
    }

    const created: { key: string; name: string; channelId: string | null }[] = [];
    for (const ch of preview.channels) {
      const existingCh = existingCategory.channels.find((ec) => ec.name === ch.name);
      if (!existingCh) {
        const newChId = `ch-${code}-${ch.key}`;
        existingCategory.channels.push({
          id: newChId,
          discordChannelId: null,
          name: ch.name,
          type: ch.type,
          categoryId: existingCategory.id,
          topic: `${lang.nativeName} ${ch.key} channel`,
          isPrivateLeadership: false,
          accessClassification: 'verified_member',
          languageCode: code,
          mappedRolePurpose: ch.key,
          discoveredFromExisting: false,
          required: false,
          permissionOverwrites: [],
          lifecycleState: 'confirmed',
        });
        created.push({ key: ch.key, name: ch.name, channelId: newChId });
      } else {
        created.push({ key: ch.key, name: existingCh.name, channelId: existingCh.id });
      }
    }

    lang.categoryId = existingCategory.id;
    lang.channelsCreated = true;
    lang.createdChannels = created;
    lang.enabled = true;
    lang.updatedAt = new Date().toISOString();

    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'channel_create',
      code,
      preview.categoryName,
      `Created ${created.length} approved channels under category "${preview.categoryName}" and enabled ${lang.name}.`,
    );
    res.json({ language: lang, discovery: guild.discovery });
  });

  app.post('/api/guild/:guildId/languages/:code/toggle', requireAuth('languages.manage'), async (req: AuthenticatedRequest, res) => {
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
        res.status(403).json({ error: `Your rank (${req.sessionUser!.clanRank}) cannot assign ${parsed.data.clanRank}.` });
        return;
      }
      member.clanRank = parsed.data.clanRank;
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
      `Updated profile/roles for ${member.username} (Rank: ${member.clanRank}, Languages: ${member.languageCodes.join(',') || 'none'}).`,
    );
    res.json({ member });
  });

  // Role Panels & Safe Publish
  app.post('/api/guild/:guildId/role-panels', requireAuth('roles.publish'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/role-panels/:panelId/publish', requireAuth('roles.publish'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    const panel = guild?.rolePanels.find((p) => p.id === req.params.panelId);
    if (!guild || !panel) {
      res.status(404).json({ error: 'Role panel not found' });
      return;
    }

    const liveGuild = botClient.getLiveDiscordGuild();
    if (liveGuild) {
      const pubRes = await botClient.publishRolePanelToDiscord(liveGuild, panel);
      if (!pubRes.ok) {
        res.status(502).json({ error: pubRes.error || 'Discord failed to publish role panel.' });
        return;
      }
    }

    panel.published = true;
    panel.publishedAt = new Date().toISOString();
    await db.saveGuild(guild);
    await recordDashboardAudit(
      guild.guildId,
      req.sessionUser!,
      'role_change',
      panel.id,
      panel.title,
      `Executed /roles publish for "${panel.title}" in #${panel.channelName} (liveDiscord=${Boolean(liveGuild)}; zero server setup changes).`,
    );
    res.json({ panel, liveDiscord: Boolean(liveGuild) });
  });

  // Moderation & Appeals
  app.post('/api/guild/:guildId/moderation', requireAuth('moderation.execute'), async (req: AuthenticatedRequest, res) => {
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
      res.status(403).json({ error: `Hierarchy check blocked action against ${targetMember.clanRank}.` });
      return;
    }

    const now = new Date().toISOString();
    const durationMinutes = parsed.data.durationMinutes ?? null;
    const expiresAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60_000).toISOString() : null;

    let discordExecutionStatus: 'verified_live' | 'dry_run_no_bot' | 'failed' = 'dry_run_no_bot';
    let discordError: string | null = null;

    const liveGuild = botClient.getLiveDiscordGuild();
    if (liveGuild) {
      const execRes = await botClient.executeLiveModeration(liveGuild, {
        action: parsed.data.action,
        targetUserId: parsed.data.targetUserId,
        reason: parsed.data.reason,
        durationMinutes,
        channelName: parsed.data.channelName ?? 'common-hall',
      });
      if (execRes.ok) {
        discordExecutionStatus = 'verified_live';
      } else {
        discordExecutionStatus = 'failed';
        discordError = execRes.error || 'Discord API rejected moderation operation.';
      }
    }

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
      active: discordExecutionStatus !== 'failed' && !['untimeout', 'unban', 'unlock'].includes(parsed.data.action),
      channelName: parsed.data.channelName ?? null,
      discordExecutionStatus,
      discordError,
      createdAt: now,
    };
    guild.moderationCases.unshift(modCase);

    if (discordExecutionStatus !== 'failed') {
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
        : `${caseId} (${discordExecutionStatus}): ${parsed.data.action} on ${parsed.data.targetUsername} — ${parsed.data.reason}`,
    );

    if (discordExecutionStatus === 'failed') {
      res.status(502).json({ error: discordError, modCase });
      return;
    }
    res.status(201).json({ modCase });
  });

  app.post('/api/guild/:guildId/appeals/:appealId/review', requireAuth('moderation.execute'), async (req: AuthenticatedRequest, res) => {
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
  app.put('/api/guild/:guildId/automod', requireAuth('automod.manage'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/automod/test', requireAuth('automod.manage'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const evaluation = automodEngine.evaluateMessage(guild.automod, {
      userId: 'sim-test-user',
      username: String(req.body?.username || 'TestRecruit'),
      content: String(req.body?.content || ''),
      channelName: String(req.body?.channelName || 'common-hall'),
      userRoles: Array.isArray(req.body?.userRoles) ? req.body.userRoles : ['🌱 Recruit'],
      mentionCount: Number(req.body?.mentionCount || 0),
    });
    res.json({ evaluation });
  });

  // Logging Config
  app.put('/api/guild/:guildId/logging/config', requireAuth('logging.manage'), async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/guild/:guildId/tickets', requireAuth('tickets.view'), async (req: AuthenticatedRequest, res) => {
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
          authorRole: req.sessionUser!.clanRank,
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

  app.post('/api/guild/:guildId/tickets/:ticketId/messages', requireAuth('tickets.view'), async (req: AuthenticatedRequest, res) => {
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
      authorRole: req.sessionUser!.clanRank,
      content: parsed.data.content,
      createdAt: new Date().toISOString(),
    });
    await db.saveGuild(guild);
    res.json({ ticket });
  });

  app.post('/api/guild/:guildId/tickets/:ticketId/action', requireAuth('tickets.manage'), async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/guild/:guildId/recruitment/apply', requireAuth('overview.view'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/recruitment/:appId/review', requireAuth('recruitment.review'), async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/guild/:guildId/community/suggestions', requireAuth('overview.view'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/community/suggestions/:id/vote', requireAuth('overview.view'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/community/polls', requireAuth('community.manage'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/community/polls/:id/vote', requireAuth('overview.view'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/community/giveaways', requireAuth('community.manage'), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/guild/:guildId/community/events', requireAuth('community.manage'), async (req: AuthenticatedRequest, res) => {
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
    const ev = {
      id: `event-${Date.now()}`,
      title,
      description,
      eventType: (req.body?.eventType || 'community') as 'raid' | 'dungeon' | 'community' | 'tournament',
      gameId: String(req.body?.gameId || guild.games[0]?.id || 'game-loe'),
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

  app.post('/api/guild/:guildId/community/announcements', requireAuth('community.manage'), async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/guild/:guildId/clan/games', requireAuth('clan.manage'), async (req: AuthenticatedRequest, res) => {
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
    const game = { id: `game-${Date.now()}`, name, shortCode, active: true };
    guild.games.push(game);
    await db.saveGuild(guild);
    res.status(201).json({ game });
  });

  app.post('/api/guild/:guildId/clan/teams', requireAuth('clan.manage'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const gameId = String(req.body?.gameId || guild.games[0]?.id || 'game-loe');
    if (name.length < 2) {
      res.status(400).json({ error: 'Team name is required.' });
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

  app.post('/api/guild/:guildId/clan/raids', requireAuth('clan.manage'), async (req: AuthenticatedRequest, res) => {
    const guild = await db.getGuild(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    const title = String(req.body?.title || '').trim();
    const kind = req.body?.kind === 'dungeon' ? 'dungeon' : 'raid';
    if (title.length < 2) {
      res.status(400).json({ error: 'Raid/Dungeon title is required.' });
      return;
    }
    const raid = {
      id: `raid-${Date.now()}`,
      title,
      kind: kind as 'raid' | 'dungeon',
      gameId: String(req.body?.gameId || guild.games[0]?.id || 'game-loe'),
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
    const executed = await scheduler.tick();
    res.json({ executed });
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
    const liveGuild = botClient.getLiveDiscordGuild();
    const result = await executeSlashCommand(parsed.data.command, {
      guildId: req.params.guildId,
      actorUserId: req.sessionUser!.userId,
      actorUsername: req.sessionUser!.username,
      actorRank: req.sessionUser!.clanRank,
      locale: 'en',
      channelName: parsed.data.channelName,
      args: parsed.data.args,
      db,
      discordExecutor: liveGuild ? botClient.buildDiscordExecutor(liveGuild) : undefined,
    });
    res.json({ result });
  });

  // Backup Export
  app.get('/api/guild/:guildId/backup', requireAuth('settings.manage'), async (_req, res) => {
    const snapshot = await db.exportSnapshot();
    res.json({
      exportedAt: new Date().toISOString(),
      schemaVersion: snapshot.schemaVersion,
      guilds: snapshot.guilds,
    });
  });

  // Serve Vite in development or static dist in production
  if (env.nodeEnv !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[ShadowSlayers] Server listening on http://0.0.0.0:${env.port} (adapter=${db.driverName})`);
  });
}

bootstrap().catch((err) => {
  console.error('[ShadowSlayers] Fatal startup error:', err);
  process.exit(1);
});
