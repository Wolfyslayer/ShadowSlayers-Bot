import assert from 'node:assert/strict';
import test from 'node:test';
import { SlidingWindowRateLimiter } from '../packages/shared/src/sliding-window-rate-limiter.ts';

test('sliding window allows the configured count and reports retry time when exceeded', () => {
  const limiter = new SlidingWindowRateLimiter(2, 10_000);

  assert.deepEqual(limiter.consume('client-a', 1_000), { allowed: true });
  assert.deepEqual(limiter.consume('client-a', 2_000), { allowed: true });
  assert.deepEqual(limiter.consume('client-a', 3_000), {
    allowed: false,
    reason: 'limit',
    retryAfterSeconds: 8,
  });
  assert.deepEqual(limiter.consume('client-a', 11_000), { allowed: true });
});

test('sliding windows are isolated by key and cap tracked client state', () => {
  const limiter = new SlidingWindowRateLimiter(1, 1_000, 1);

  assert.deepEqual(limiter.consume('client-a', 1_000), { allowed: true });
  assert.deepEqual(limiter.consume('client-b', 1_001), {
    allowed: false,
    reason: 'capacity',
    retryAfterSeconds: 1,
  });
  assert.deepEqual(limiter.consume('client-b', 2_001), { allowed: true });
});
