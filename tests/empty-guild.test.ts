import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyGuild } from '../packages/database/src/empty-guild.ts';

test('new guild state contains no activity, legacy template, or enabled modules', () => {
  const guild = createEmptyGuild('123', 'New guild');
  assert.equal(guild.guildId, '123');
  assert.equal(guild.discovery.guildName, 'New guild');
  for (const value of [...Object.values(guild), ...Object.values(guild.discovery)]) {
    if (Array.isArray(value)) assert.equal(value.length, 0);
  }
  assert.deepEqual(guild.translations, {});
  assert.ok(Object.values(guild.modules).every((enabled) => !enabled));
  assert.ok(Object.values(guild.logging.channels).every((channel) => channel === ''));
  assert.notEqual(guild.members, createEmptyGuild('456', 'Another guild').members);
});
