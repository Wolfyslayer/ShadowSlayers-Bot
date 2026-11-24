export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'limit' | 'capacity'; retryAfterSeconds: number };

export class SlidingWindowRateLimiter {
  private readonly requestsByKey = new Map<string, number[]>();
  private lastCleanupAt = 0;

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly maxTrackedKeys = 10_000,
  ) {
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
      throw new RangeError('maxRequests must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new RangeError('windowMs must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(maxTrackedKeys) || maxTrackedKeys < 1) {
      throw new RangeError('maxTrackedKeys must be a positive safe integer.');
    }
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const previous = this.requestsByKey.get(key) ?? [];
    const active = previous.filter((timestamp) => timestamp > cutoff);

    if (active.length >= this.maxRequests) {
      this.requestsByKey.set(key, active);
      return {
        allowed: false,
        reason: 'limit',
        retryAfterSeconds: Math.max(1, Math.ceil((active[0] + this.windowMs - now) / 1000)),
      };
    }

    if (!this.requestsByKey.has(key) && this.requestsByKey.size >= this.maxTrackedKeys) {
      this.removeExpired(now);
      if (this.requestsByKey.size >= this.maxTrackedKeys) {
        return { allowed: false, reason: 'capacity', retryAfterSeconds: 1 };
      }
    }

    active.push(now);
    this.requestsByKey.set(key, active);

    if (now - this.lastCleanupAt >= Math.min(this.windowMs, 60_000)) {
      this.removeExpired(now);
    }

    return { allowed: true };
  }

  private removeExpired(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.requestsByKey) {
      const active = timestamps.filter((timestamp) => timestamp > cutoff);
      if (active.length === 0) this.requestsByKey.delete(key);
      else this.requestsByKey.set(key, active);
    }
    this.lastCleanupAt = now;
  }
}
