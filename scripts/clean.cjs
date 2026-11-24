const fs = require('node:fs');

for (const outputDir of ['dist', 'dist-bot', 'dist-api']) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
