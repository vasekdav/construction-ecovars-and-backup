import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("uses a random salt", async () => {
    const a = await hashPassword("same password 123");
    const b = await hashPassword("same password 123");
    expect(a).not.toBe(b);
  });

  it.each([
    ["empty", ""],
    ["wrong scheme", "bcrypt$1$2$3$abc$def"],
    ["too few parts", "scrypt$16384$8$1$abc"],
    ["non-numeric params", "scrypt$x$8$1$c2FsdA==$aGFzaA=="],
    ["zero param", "scrypt$0$8$1$c2FsdA==$aGFzaA=="],
    ["empty hash", "scrypt$16384$8$1$c2FsdA==$"],
  ])("rejects malformed stored value (%s)", async (_label, stored) => {
    expect(await verifyPassword("anything", stored)).toBe(false);
  });
});
