export const STAGE_STATES = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "CLOSED", "BLOCKED"] as const;
export type StageState = (typeof STAGE_STATES)[number];

export const TRANSITIONS = ["start", "submit", "return", "close", "block", "unblock", "reopen"] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const DECISION_OUTCOMES = ["YES", "NO", "DEFERRED"] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Minimal stage snapshot used by the pure workflow functions. */
export interface StageSnapshot {
  key: string;
  state: StageState;
  enabled: boolean;
}
