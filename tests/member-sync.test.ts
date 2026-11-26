import assert from 'node:assert/strict';
import test from 'node:test';
import { enumerateGuildMembers, synchronizeMemberProfile } from '../apps/bot/src/services/member-sync.ts';

test('member enumeration advances by numeric Discord ID and propagates failures', async () => {
  const result = await enumerateGuildMembers(async ({ after }) => {
    if (!after) return new Map([['10', { id: '10' }], ['9', { id: '9' }]]);
    assert.equal(after, '10');
    return new Map([['11', { id: '11' }]]);
  }, 2);
  assert.deepEqual([...result.keys()].sort(), ['10', '11', '9']);
  await assert.rejects(() => enumerateGuildMembers(async () => { throw new Error('offline'); }), /offline/);
  await assert.rejects(() =>
    enumerateGuildMembers(async () => new Map([['9', { id: '9' }]]), 1), /did not advance/);
});

test('member profile uses the Discord ID and preserves progress on rejoin', () => {
  const profile = {
    userId: '123', username: 'first', displayName: 'First',
    avatarUrl: null, joinedAt: '2026-01-01T00:00:00Z',
  };
  const initial = synchronizeMemberProfile(undefined, profile);
  assert.equal(initial.userId, '123');
  assert.equal(initial.xp, 0);
  const updated = synchronizeMemberProfile({ ...initial, xp: 40, isDeparted: true }, {
    ...profile, displayName: 'New name',
  });
  assert.equal(updated.displayName, 'New name');
  assert.equal(updated.xp, 40);
  assert.equal(updated.isDeparted, false);
});
