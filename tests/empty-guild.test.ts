import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyGuild } from '../packages/database/src/empty-guild.ts';
import { discoverLiveDiscordGuild } from '../apps/bot/src/services/discovery.ts';

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

test('generic startup discovery only records live Discord resources', () => {
  const guild = createEmptyGuild('123', 'New guild');
  const snapshot = discoverLiveDiscordGuild({
    id: guild.guildId,
    name: guild.guildName,
    roles: { cache: new Map([['real-role', { id: 'real-role', name: 'Visitors', position: 1, mentionable: false }]]) },
    channels: { cache: new Map() },
  } as Parameters<typeof discoverLiveDiscordGuild>[0], guild.discovery, false);
  assert.deepEqual(snapshot.roles.map((role) => role.discordRoleId), ['real-role']);
  assert.deepEqual(snapshot.categories, []);
  assert.deepEqual(snapshot.optionalChannels, []);
  assert.deepEqual(snapshot.proposedChanges, []);
});
