import { describe, expect, it } from "vitest";
import { unmetDependencies, waitingOn } from "@/lib/workflow/dependencies";
import { canConfirmCheck, canEditStage, canManageStage, canTransition } from "@/lib/workflow/permissions";
import { DEFAULT_TEMPLATE, stageTemplate, type GateCondition } from "@/lib/workflow/template";
import type { StageSnapshot, StageState } from "@/lib/workflow/types";

const T = DEFAULT_TEMPLATE;
function stages(states: Record<string, StageState>, disabled: string[] = []): StageSnapshot[] {
  return T.stages.map((s) => ({
    key: s.key,
    state: states[s.key] ?? "NOT_STARTED",
    enabled: s.optional ? !disabled.includes(`-${s.key}`) && disabled.includes(`+${s.key}`) : !disabled.includes(s.key),
  }));
}

describe("dependencies", () => {
  it("step 8 waits for 4, 5 and 7", () => {
    expect(unmetDependencies(T, "8", stages({ "4": "CLOSED" }))).toEqual(["5", "7"]);
    expect(unmetDependencies(T, "8", stages({ "4": "CLOSED", "5": "CLOSED", "7": "CLOSED" }))).toEqual([]);
  });

  it("ignores disabled optional steps but respects enabled ones", () => {
    expect(unmetDependencies(T, "10", stages({ "6": "CLOSED" }))).toEqual([]);
    expect(unmetDependencies(T, "10", stages({ "6": "CLOSED" }, ["+H1"]))).toEqual(["H1"]);
  });

  it("throws for unknown steps", () => {
    expect(() => unmetDependencies(T, "99", [])).toThrow();
    expect(() => waitingOn(T, { key: "99", state: "NOT_STARTED", enabled: true }, [])).toThrow();
  });

  it("computes who waits for whom", () => {
    const all = stages({ "1": "CLOSED", "2": "IN_PROGRESS", "4": "IN_REVIEW", "5": "BLOCKED" });
    const at = (k: string) => waitingOn(T, all.find((s) => s.key === k)!, all);
    expect(at("1")).toEqual({ kind: "done" });
    expect(at("2")).toEqual({ kind: "owner", roles: ["OAM"] });
    expect(at("4")).toEqual({ kind: "approver", roles: ["OAM"] });
    expect(at("5")).toEqual({ kind: "blocked" });
    expect(at("7")).toEqual({ kind: "dependencies", stageKeys: ["2"] });
    const ready = stages({ "1": "CLOSED" });
    expect(waitingOn(T, ready.find((s) => s.key === "2")!, ready)).toEqual({ kind: "owner", roles: ["OAM"] });
  });
});

describe("stage permissions", () => {
  const s4 = stageTemplate(T, "4");
  it("step owners and OAM may start/submit/block; only OAM closes, returns and reopens", () => {
    expect(canTransition(["ROC"], s4, "start")).toBe(true);
    expect(canTransition(["ROC"], s4, "submit")).toBe(true);
    expect(canTransition(["ROC"], s4, "close")).toBe(false);
    expect(canTransition(["OAM"], s4, "close")).toBe(true);
    expect(canTransition(["OAM"], s4, "reopen")).toBe(true);
    expect(canTransition(["OPS"], s4, "start")).toBe(false);
    expect(canTransition(["ADMIN"], s4, "start")).toBe(false);
  });

  it("closed steps are frozen", () => {
    expect(canEditStage(["ROC"], s4, "IN_PROGRESS")).toBe(true);
    expect(canEditStage(["ROC"], s4, "CLOSED")).toBe(false);
    expect(canEditStage(["OPS"], s4, "IN_PROGRESS")).toBe(false);
  });

  it("manual checks are confirmed only by the listed roles", () => {
    const check = s4.gate.find((g) => g.type === "manualCheck") as Extract<GateCondition, { type: "manualCheck" }>;
    expect(canConfirmCheck(["ROC"], check, "IN_REVIEW")).toBe(true);
    expect(canConfirmCheck(["OAM"], check, "IN_REVIEW")).toBe(false);
    expect(canConfirmCheck(["ROC"], check, "CLOSED")).toBe(false);
  });

  it("only OAM manages step settings", () => {
    expect(canManageStage(["OAM"])).toBe(true);
    expect(canManageStage(["ADMIN"])).toBe(false);
  });
});
