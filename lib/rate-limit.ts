/**
 * Fixed-window in-memory rate limiter.
 *
 * Limitation (docs/DECISIONS.md ADR-006): state is per server instance. On
 * Vercel each instance has its own counters; a shared store (e.g. Redis) is
 * needed for a strict global limit.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Prune expired entries once the map grows beyond this size. */
  maxEntries?: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(private readonly opts: RateLimiterOptions) {
    if (!(opts.limit > 0) || !(opts.windowMs > 0)) throw new Error("limit and windowMs must be > 0");
    this.now = opts.now ?? Date.now;
    this.maxEntries = opts.maxEntries ?? 10_000;
  }

  consume(key: string): RateLimitResult {
    const t = this.now();
    if (this.hits.size > this.maxEntries) this.prune(t);
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.opts.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    const allowed = entry.count <= this.opts.limit;
    return {
      allowed,
      remaining: Math.max(0, this.opts.limit - entry.count),
      retryAfterMs: allowed ? 0 : entry.resetAt - t,
    };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}

/** Shared limiters (operational limits of the app, not engineering values). */
export const loginLimiter = new RateLimiter({ limit: 10, windowMs: 15 * 60_000 });
export const apiLimiter = new RateLimiter({ limit: 300, windowMs: 60_000 });
export const actionLimiter = new RateLimiter({ limit: 120, windowMs: 60_000 });
