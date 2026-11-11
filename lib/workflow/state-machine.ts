import type { GateEvaluation } from "./gate";
import type { StageState, Transition } from "./types";

/** Stage state machine (SPEC §3): NOT_STARTED → IN_PROGRESS → IN_REVIEW → CLOSED, or BLOCKED. */
export const TRANSITION_TABLE: Record<Transition, { from: readonly StageState[]; to: StageState | "previous" }> = {
  start: { from: ["NOT_STARTED"], to: "IN_PROGRESS" },
  submit: { from: ["IN_PROGRESS"], to: "IN_REVIEW" },
  return: { from: ["IN_REVIEW"], to: "IN_PROGRESS" },
  close: { from: ["IN_REVIEW"], to: "CLOSED" },
  block: { from: ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW"], to: "BLOCKED" },
  /** Back to the state the stage was blocked from. */
  unblock: { from: ["BLOCKED"], to: "previous" },
  reopen: { from: ["CLOSED"], to: "IN_PROGRESS" },
};

const REASON_REQUIRED: readonly Transition[] = ["block", "reopen", "return"];

export type TransitionError =
  | "invalid_transition"
  | "dependencies_open"
  | "gate_not_passed"
  | "reason_required"
  | "stage_disabled";

export interface TransitionInput {
  transition: Transition;
  state: StageState;
  enabled: boolean;
  /** For unblock: the state stored when the stage was blocked. */
  blockedFrom: StageState | null;
  unmetDependencies: readonly string[];
  /** Required for `close`. */
  gate?: GateEvaluation;
  reason?: string | null;
}

export type TransitionResult = { ok: true; to: StageState } | { ok: false; errors: TransitionError[] };

export function checkTransition(input: TransitionInput): TransitionResult {
  const rule = TRANSITION_TABLE[input.transition];
  if (!input.enabled) return { ok: false, errors: ["stage_disabled"] };
  if (!rule.from.includes(input.state)) return { ok: false, errors: ["invalid_transition"] };

  const errors: TransitionError[] = [];
  if (REASON_REQUIRED.includes(input.transition) && !input.reason?.trim()) errors.push("reason_required");
  if ((input.transition === "start" || input.transition === "close") && input.unmetDependencies.length) {
    errors.push("dependencies_open");
  }
  if (input.transition === "close" && !input.gate?.passed) errors.push("gate_not_passed");

  let to: StageState;
  if (rule.to === "previous") {
    to = input.blockedFrom && input.blockedFrom !== "BLOCKED" && input.blockedFrom !== "CLOSED" ? input.blockedFrom : "NOT_STARTED";
  } else {
    to = rule.to;
  }
  return errors.length ? { ok: false, errors } : { ok: true, to };
}

/** Transitions offered in the UI for a given state (before permission and guard checks). */
export function availableTransitions(state: StageState): Transition[] {
  return (Object.keys(TRANSITION_TABLE) as Transition[]).filter((t) => TRANSITION_TABLE[t].from.includes(state));
}
