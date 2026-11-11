import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/rate-limit";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  it("allows up to the limit within a window, then blocks", () => {
    const c = clock();
    const rl = new RateLimiter({ limit: 2, windowMs: 1000, now: c.now });
    expect(rl.consume("a")).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 });
    expect(rl.consume("a").allowed).toBe(true);
    const blocked = rl.consume("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    expect(rl.consume("b").allowed).toBe(true);
  });

  it("resets after the window", () => {
    const c = clock();
    const rl = new RateLimiter({ limit: 1, windowMs: 1000, now: c.now });
    rl.consume("a");
    expect(rl.consume("a").allowed).toBe(false);
    c.advance(1000);
    expect(rl.consume("a").allowed).toBe(true);
  });

  it("reset() clears a key", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    rl.consume("a");
    rl.reset("a");
    expect(rl.consume("a").allowed).toBe(true);
  });

  it("prunes expired entries when over capacity", () => {
    const c = clock();
    const rl = new RateLimiter({ limit: 1, windowMs: 10, now: c.now, maxEntries: 2 });
    rl.consume("a");
    rl.consume("b");
    rl.consume("c");
    expect(rl.size).toBe(3);
    c.advance(20);
    rl.consume("d");
    expect(rl.size).toBe(1);
  });

  it("rejects invalid options", () => {
    expect(() => new RateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new RateLimiter({ limit: 1, windowMs: 0 })).toThrow();
  });
});
