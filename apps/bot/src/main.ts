import { loadEnv } from '../../../packages/config/src/env.ts';
import { createDatabaseAdapter } from '../../../packages/database/src/adapter.ts';
import { PersistentTaskScheduler } from './services/scheduler.ts';
import { ShadowSlayersBotClient } from './index.ts';

function requireBotConfiguration(): ReturnType<typeof loadEnv> {
  const env = loadEnv();
  const errors: string[] = [];

  if (env.nodeEnv === 'production' && env.databaseAdapter !== 'firestore') {
    errors.push('Production bot deployments require DATABASE_ADAPTER=firestore.');
  }
  if (!env.discordBotToken.trim()) errors.push('DISCORD_BOT_TOKEN is required.');
  if (!/^\d{15,22}$/.test(env.discordClientId)) {
    errors.push('DISCORD_CLIENT_ID must be a Discord application ID (15-22 digits).');
  }
  const adapter = (process.env.DATABASE_ADAPTER || 'local').toLowerCase();
  if (adapter !== 'local' && adapter !== 'firestore') {
    errors.push('DATABASE_ADAPTER must be either "local" or "firestore".');
  }
  if (adapter === 'firestore' && env.botControlSecret.length < 32) {
    errors.push('BOT_CONTROL_SECRET must contain at least 32 characters when DATABASE_ADAPTER=firestore.');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid bot configuration:\n- ${errors.join('\n- ')}`);
  }

  return env;
}

async function runBot(): Promise<void> {
  const env = requireBotConfiguration();
  const db = createDatabaseAdapter(
    env.databaseAdapter,
    env.localDbPath,
    undefined,
    env.nodeEnv,
    env.firebase,
  );
  const scheduler = new PersistentTaskScheduler(db, undefined, (err) => {
    console.error('[ShadowSlayers] Scheduler tick failed:', err);
  });
  const bot = new ShadowSlayersBotClient(db, env.botControlSecret);
  let stopping = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`[ShadowSlayers] Received ${signal}; shutting down.`);
    await bot.stop();
    await scheduler.stop();
    await db.close?.();
  };

  const onSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal).catch((err) => {
      console.error('[ShadowSlayers] Graceful shutdown failed:', err);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    await db.init();
    scheduler.start(30_000);
    await bot.start(env.discordBotToken, env.discordClientId, env.discordCommandScope);
    console.log('[ShadowSlayers] Discord bot is ready.');
  } catch (err) {
    const cleanupResults = await Promise.allSettled([
      bot.stop(),
      scheduler.stop(),
      db.close?.() ?? Promise.resolve(),
    ]);
    for (const result of cleanupResults) {
      if (result.status === 'rejected') {
        console.error('[ShadowSlayers] Startup cleanup failed:', result.reason);
      }
    }
    throw err;
  }
}

runBot().catch((err) => {
  console.error('[ShadowSlayers] Bot startup failed:', err);
  process.exitCode = 1;
});
