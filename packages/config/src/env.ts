import dotenv from 'dotenv';

dotenv.config();

export interface FirebaseAdminConfig {
  projectId: string;
  clientEmail?: string;
  privateKey?: string;
}

export type DiscordCommandScope = 'auto' | 'guild' | 'global';

export interface RuntimeEnv {
  port: number;
  appUrl: string;
  nodeEnv: string;
  discordBotToken: string;
  discordClientId: string;
  discordClientSecret: string;
  botControlSecret: string;
  discordCommandScope: DiscordCommandScope;
  allowedOrigins: string[];
  sessionSecret: string;
  databaseAdapter: 'local' | 'firestore' | 'supabase';
  localDbPath: string;
  firebase: FirebaseAdminConfig | null;
}

export function loadEnv(): RuntimeEnv {
  const adapterRaw = (process.env.DATABASE_ADAPTER || 'local').toLowerCase();
  if (adapterRaw !== 'local' && adapterRaw !== 'firestore' && adapterRaw !== 'supabase') {
    throw new Error('DATABASE_ADAPTER must be "local" or "firestore"; Supabase is unsupported.');
  }
  const databaseAdapter = adapterRaw;

  const scopeRaw = (process.env.DISCORD_COMMAND_SCOPE || 'auto').toLowerCase();
  if (scopeRaw !== 'auto' && scopeRaw !== 'guild' && scopeRaw !== 'global') {
    throw new Error('DISCORD_COMMAND_SCOPE must be "auto", "guild", or "global".');
  }
  const discordCommandScope = scopeRaw;
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const nodeEnv = process.env.NODE_ENV || 'development';
  const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const hasServiceAccountFields = Boolean(clientEmail || privateKey);
  if (hasServiceAccountFields && (!projectId || !clientEmail || !privateKey)) {
    throw new Error(
      'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must be configured together.',
    );
  }
  const firebase: FirebaseAdminConfig | null = projectId
    ? {
        projectId,
        ...(hasServiceAccountFields ? { clientEmail, privateKey } : {}),
      }
    : null;

  return {
    port,
    appUrl,
    nodeEnv,
    discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
    discordClientId: process.env.DISCORD_CLIENT_ID || '',
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    botControlSecret: process.env.BOT_CONTROL_SECRET || '',
    discordCommandScope,
    allowedOrigins: Array.from(
      new Set([
        appUrl,
        ...(nodeEnv === 'production' ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']),
        ...extraOrigins,
      ]),
    ),
    sessionSecret: process.env.SESSION_SECRET || '',
    databaseAdapter,
    localDbPath: process.env.LOCAL_DB_PATH || '.data/shadowslayers-db.json',
    firebase,
  };
}
