import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('dashboard guild requests resolve to registered API methods and paths', () => {
  const normalize = (path: string) => path.replace(/:[\w]+|\$\{[^}]+\}/g, ':param');
  const registered = new Set([...server.matchAll(/app\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)]
    .map(([, method, path]) => `${method.toUpperCase()} ${normalize(path)}`));
  const requests = [...dashboard.matchAll(/apiRequest(?:<[^\x60]*?>)?\(\s*\x60(\/api\/guild\/[^\x60]+)\x60\s*,\s*\{\s*(?:method: '([A-Z]+)',)?/g)];
  assert.ok(requests.length >= 30, 'expected coverage of guild request call sites');
  for (const [, path, method = 'GET'] of requests) {
    assert.ok(registered.has(`${method} ${normalize(path)}`), `${method} ${path}`);
    assert.ok(!path.endsWith('/scheduler/tick'));
  }
});

test('public guild mutation routes declare their capability and feature module', () => {
  const expectations = [
    ['/discovery/confirm', 'discovery.apply', 'discovery'],
    ['/role-panels/:panelId/publish', 'roles.publish', 'roles'],
    ['/rules/publish', 'roles.publish', 'onboarding'],
    ['/moderation', 'moderation.execute', 'moderation'],
    ['/community/announcements', 'community.manage', 'community'],
  ] as const;
  for (const [path, capability, module] of expectations) {
    assert.ok(server.includes(
      `app.post('/api/guild/:guildId${path}', requireAuth('${capability}', '${module}')`,
    ), path);
  }
});
