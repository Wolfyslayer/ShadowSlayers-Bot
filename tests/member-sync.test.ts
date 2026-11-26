import assert from 'node:assert/strict';
import test from 'node:test';
import { synchronizeMemberProfile } from '../apps/bot/src/services/member-sync.ts';

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
