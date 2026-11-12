import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const DB = "postgres://u:p@localhost:5432/db";
const SECRET = "x".repeat(32);

describe("parseServerEnv", () => {
  it("needs only DATABASE_URL in the open mode (ADR-039)", () => {
    expect(parseServerEnv({ DATABASE_URL: DB }).DATABASE_URL).toBe(DB);
    expect(parseServerEnv({ DATABASE_URL: DB, NEXTAUTH_SECRET: "" }).NEXTAUTH_SECRET).toBeUndefined();
  });

  it("needs a long NEXTAUTH_SECRET in the password mode", () => {
    expect(() => parseServerEnv({ DATABASE_URL: DB, AUTH_MODE: "password" })).toThrow(/NEXTAUTH_SECRET/);
    expect(() => parseServerEnv({ DATABASE_URL: DB, AUTH_MODE: "password", NEXTAUTH_SECRET: "short" })).toThrow(/32/);
    expect(parseServerEnv({ DATABASE_URL: DB, AUTH_MODE: "password", NEXTAUTH_SECRET: SECRET }).NEXTAUTH_SECRET).toBe(SECRET);
  });

  it("rejects a missing database URL", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });
});
