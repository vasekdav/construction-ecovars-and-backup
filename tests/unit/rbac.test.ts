import { describe, expect, it } from "vitest";
import { assertCan, can, ForbiddenError, PERMISSIONS } from "@/lib/auth/rbac";
import { isRole, ROLES } from "@/lib/auth/roles";

describe("rbac", () => {
  it("grants user management only to ADMIN", () => {
    expect(can(["ADMIN"], "user.manage")).toBe(true);
    for (const r of ROLES.filter((r) => r !== "ADMIN")) expect(can([r], "user.manage")).toBe(false);
  });

  it("allows NO-GO override and rule verification only to Process Safety (SPEC §7.1)", () => {
    expect(can(["PROCESS_SAFETY"], "rule.override")).toBe(true);
    expect(can(["ADMIN"], "rule.override")).toBe(false);
    expect(can(["OAM"], "rule.verify")).toBe(false);
  });

  it("denies everything to a user without roles", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can([], p)).toBe(false);
  });

  it("any of several roles is sufficient", () => {
    expect(can(["OPS", "ADMIN"], "user.manage")).toBe(true);
  });

  it("assertCan throws ForbiddenError", () => {
    expect(() => assertCan(["OPS"], "user.manage")).toThrow(ForbiddenError);
    expect(() => assertCan(["ADMIN"], "user.manage")).not.toThrow();
  });

  it("only references known roles", () => {
    for (const roles of Object.values(PERMISSIONS)) for (const r of roles) expect(isRole(r)).toBe(true);
    expect(isRole("ROOT")).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});
