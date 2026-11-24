const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const botBundlePath = 'dist-bot/index.js';
const botBundle = fs.readFileSync(botBundlePath, 'utf8');
if (/from\s+["'](?:express|vite)["']/.test(botBundle)) {
  console.error('[FAIL] Bot bundle imports an HTTP or dashboard runtime dependency.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [botBundlePath], {
  encoding: 'utf8',
  env: {
    ...process.env,
    DISCORD_BOT_TOKEN: '',
    DISCORD_CLIENT_ID: '',
  },
});
const output = `${result.stdout || ''}\n${result.stderr || ''}`;

if (result.error || result.status === 0 || !output.includes('Invalid bot configuration')) {
  console.error(output);
  console.error('[FAIL] Standalone bot did not reject missing configuration as expected.');
  process.exit(1);
}

console.log('[PASS] Standalone bot validates configuration without starting a dashboard or listener.');
