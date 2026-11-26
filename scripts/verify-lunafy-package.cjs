const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(process.argv[2] || 'lunafy-package');
const requiredFiles = ['dist-bot/index.js', 'package.json', 'package-lock.json'];
const allowedFiles = new Set(requiredFiles);
const forbiddenNames = new Set([
  '.env',
  'node_modules',
  'tests',
  'test',
  'id_rsa',
  'id_ed25519',
]);
const forbiddenExtensions = new Set(['.key', '.pem', '.p12', '.pfx']);

function fail(message) {
  console.error(`[Lunafy package] ${message}`);
  process.exitCode = 1;
}

function listFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) {
      fail(`Symbolic links are forbidden: ${relativePath}`);
      return [];
    }
    if (entry.isDirectory()) {
      if (forbiddenNames.has(entry.name.toLowerCase())) {
        fail(`Forbidden directory found: ${relativePath}`);
      }
      return listFiles(path.join(directory, entry.name), relativePath);
    }
    return [relativePath];
  });
}

if (!fs.existsSync(packageRoot)) {
  fail(`Package directory does not exist: ${packageRoot}`);
} else {
  const files = listFiles(packageRoot).sort();
  for (const requiredFile of requiredFiles) {
    if (!files.includes(requiredFile)) fail(`Required runtime file is missing: ${requiredFile}`);
  }
  for (const file of files) {
    const basename = path.posix.basename(file).toLowerCase();
    const extension = path.posix.extname(file).toLowerCase();
    if (!allowedFiles.has(file)) fail(`Unexpected file in minimal artifact: ${file}`);
    if (basename === '.env' || basename.startsWith('.env.')) fail(`Environment file is forbidden: ${file}`);
    if (forbiddenNames.has(basename) || forbiddenExtensions.has(extension)) fail(`Sensitive file is forbidden: ${file}`);
  }

  const manifestPath = path.join(packageRoot, 'package.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.scripts?.['start:bot'] !== 'node dist-bot/index.js') {
      fail('package.json start:bot must remain compatible with dist-bot/index.js');
    }
  }
}

if (!process.exitCode) {
  console.log('[Lunafy package] Verified minimal package and MAIN_FILE=dist-bot/index.js contract.');
}

