import { describe, expect, it } from "vitest";
import { availableTransitions, checkTransition, type TransitionInput } from "@/lib/workflow/state-machine";

const base: TransitionInput = {
  transition: "start",
  state: "NOT_STARTED",
  enabled: true,
  blockedFrom: null,
  unmetDependencies: [],
};
const passed = { passed: true, results: [] };
const failed = { passed: false, results: [] };

describe("checkTransition", () => {
  it("follows NOT_STARTED → IN_PROGRESS → IN_REVIEW → CLOSED", () => {
    expect(checkTransition(base)).toEqual({ ok: true, to: "IN_PROGRESS" });
    expect(checkTransition({ ...base, transition: "submit", state: "IN_PROGRESS" })).toEqual({ ok: true, to: "IN_REVIEW" });
    expect(checkTransition({ ...base, transition: "close", state: "IN_REVIEW", gate: passed })).toEqual({
      ok: true,
      to: "CLOSED",
    });
  });

  it("cannot close without passing the gate (SPEC §11.2)", () => {
    expect(checkTransition({ ...base, transition: "close", state: "IN_REVIEW", gate: failed })).toEqual({
      ok: false,
      errors: ["gate_not_passed"],
    });
    expect(checkTransition({ ...base, transition: "close", state: "IN_REVIEW" })).toEqual({
      ok: false,
      errors: ["gate_not_passed"],
    });
  });

  it("cannot skip review", () => {
    expect(checkTransition({ ...base, transition: "close", state: "IN_PROGRESS", gate: passed })).toEqual({
      ok: false,
      errors: ["invalid_transition"],
    });
  });

  it("start and close require closed dependencies", () => {
    expect(checkTransition({ ...base, unmetDependencies: ["2"] })).toEqual({ ok: false, errors: ["dependencies_open"] });
    expect(
      checkTransition({ ...base, transition: "close", state: "IN_REVIEW", gate: failed, unmetDependencies: ["2"] }),
    ).toEqual({ ok: false, errors: ["dependencies_open", "gate_not_passed"] });
  });

  it("block, reopen and return require a reason", () => {
    for (const [transition, state] of [
      ["block", "IN_PROGRESS"],
      ["reopen", "CLOSED"],
      ["return", "IN_REVIEW"],
    ] as const) {
      expect(checkTransition({ ...base, transition, state })).toEqual({ ok: false, errors: ["reason_required"] });
      expect(checkTransition({ ...base, transition, state, reason: "  " })).toEqual({ ok: false, errors: ["reason_required"] });
      expect(checkTransition({ ...base, transition, state, reason: "důvod" }).ok).toBe(true);
    }
  });

  it("unblock returns to the previous state", () => {
    const b = { ...base, transition: "unblock" as const, state: "BLOCKED" as const };
    expect(checkTransition({ ...b, blockedFrom: "IN_REVIEW" })).toEqual({ ok: true, to: "IN_REVIEW" });
    expect(checkTransition({ ...b, blockedFrom: null })).toEqual({ ok: true, to: "NOT_STARTED" });
    expect(checkTransition({ ...b, blockedFrom: "CLOSED" })).toEqual({ ok: true, to: "NOT_STARTED" });
  });

  it("closed steps cannot be blocked, disabled steps cannot transition", () => {
    expect(checkTransition({ ...base, transition: "block", state: "CLOSED", reason: "x" })).toEqual({
      ok: false,
      errors: ["invalid_transition"],
    });
    expect(checkTransition({ ...base, enabled: false })).toEqual({ ok: false, errors: ["stage_disabled"] });
  });

  it("lists available transitions per state", () => {
    expect(availableTransitions("NOT_STARTED")).toEqual(["start", "block"]);
    expect(availableTransitions("IN_REVIEW")).toEqual(["return", "close", "block"]);
    expect(availableTransitions("CLOSED")).toEqual(["reopen"]);
    expect(availableTransitions("BLOCKED")).toEqual(["unblock"]);
  });
});
