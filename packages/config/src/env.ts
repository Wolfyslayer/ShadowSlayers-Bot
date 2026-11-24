import dotenv from 'dotenv';

dotenv.config();

export interface RuntimeEnv {
  port: number;
  appUrl: string;
  nodeEnv: string;
  discordBotToken: string;
  discordClientId: string;
  discordClientSecret: string;
  discordGuildId: string;
  adminPasscode: string;
  adminDiscordUserIds: string[];
  allowedOrigins: string[];
  sessionSecret: string;
  databaseAdapter: 'local' | 'firestore' | 'supabase';
  localDbPath: string;
}

export function loadEnv(): RuntimeEnv {
  const adapterRaw = (process.env.DATABASE_ADAPTER || 'local').toLowerCase();
  const databaseAdapter: RuntimeEnv['databaseAdapter'] =
    adapterRaw === 'firestore' || adapterRaw === 'supabase' ? adapterRaw : 'local';

  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const adminDiscordUserIds = (process.env.ADMIN_DISCORD_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.PORT || 3000),
    appUrl,
    nodeEnv: process.env.NODE_ENV || 'development',
    discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
    discordClientId: process.env.DISCORD_CLIENT_ID || '',
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    discordGuildId: process.env.DISCORD_GUILD_ID || 'shadowslayers-primary',
    adminPasscode: process.env.ADMIN_PASSCODE || '',
    adminDiscordUserIds,
    allowedOrigins: Array.from(new Set([appUrl, 'http://localhost:3000', 'http://127.0.0.1:3000', ...extraOrigins])),
    sessionSecret: process.env.SESSION_SECRET || '',
    databaseAdapter,
    localDbPath: process.env.LOCAL_DB_PATH || '.data/shadowslayers-db.json',
  };
}
