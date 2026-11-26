import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGuildSeed } from './guild-seed-fixture.ts';
import { createGuildBackupExport } from '../packages/shared/src/guild-backup.ts';

test('guild backup loads and returns only the requested guild', async () => {
  const guildOne = createInitialGuildSeed('guild-one');
  const guildTwo = createInitialGuildSeed('guild-two');
  const guilds = new Map([
    [guildOne.guildId, guildOne],
    [guildTwo.guildId, guildTwo],
  ]);
  const requestedGuildIds: string[] = [];

  const backup = await createGuildBackupExport(
    guildOne.guildId,
    async (guildId) => {
      requestedGuildIds.push(guildId);
      return guilds.get(guildId) ?? null;
    },
    '2026-11-24T00:00:00.000Z',
  );

  assert.deepEqual(requestedGuildIds, [guildOne.guildId]);
  assert.deepEqual(Object.keys(backup?.guilds ?? {}), [guildOne.guildId]);
  assert.equal(backup?.schemaVersion, guildOne.schemaVersion);
  assert.strictEqual(backup?.guilds[guildOne.guildId], guildOne);
  assert.equal(backup?.guilds[guildTwo.guildId], undefined);
});

test('guild backup returns null when the requested guild does not exist', async () => {
  const backup = await createGuildBackupExport('missing-guild', async () => null);

  assert.equal(backup, null);
});
