import { describe, expect, it } from "vitest";
import { createUserSchema, loginSchema } from "@/lib/users/schemas";

describe("user schemas", () => {
  it("normalises e-mail to lower case", () => {
    const r = createUserSchema.parse({ email: "  Jane@Demo.LOCAL ", name: "Jane", password: "x".repeat(12), roles: ["OAM"] });
    expect(r.email).toBe("jane@demo.local");
  });

  it("rejects short passwords, unknown roles and invalid e-mails", () => {
    expect(createUserSchema.safeParse({ email: "a@b.cz", name: "A", password: "short", roles: [] }).success).toBe(false);
    expect(createUserSchema.safeParse({ email: "a@b.cz", name: "A", password: "x".repeat(12), roles: ["ROOT"] }).success).toBe(false);
    expect(createUserSchema.safeParse({ email: "nope", name: "A", password: "x".repeat(12), roles: [] }).success).toBe(false);
  });

  it("login requires both fields", () => {
    expect(loginSchema.safeParse({ email: "a@b.cz", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.cz", password: "p" }).success).toBe(true);
  });
});
