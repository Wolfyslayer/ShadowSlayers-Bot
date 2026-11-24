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
  sessionSecret: string;
  databaseAdapter: 'local' | 'firestore' | 'supabase';
  localDbPath: string;
}

export function loadEnv(): RuntimeEnv {
  const adapterRaw = (process.env.DATABASE_ADAPTER || 'local').toLowerCase();
  const databaseAdapter: RuntimeEnv['databaseAdapter'] =
    adapterRaw === 'firestore' || adapterRaw === 'supabase' ? adapterRaw : 'local';

  return {
    port: Number(process.env.PORT || 3000),
    appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    nodeEnv: process.env.NODE_ENV || 'development',
    discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
    discordClientId: process.env.DISCORD_CLIENT_ID || '',
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    discordGuildId: process.env.DISCORD_GUILD_ID || 'shadowslayers-primary',
    adminPasscode: process.env.ADMIN_PASSCODE || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    databaseAdapter,
    localDbPath: process.env.LOCAL_DB_PATH || '.data/shadowslayers-db.json',
  };
}
