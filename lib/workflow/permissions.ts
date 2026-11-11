import type { Role } from "@/lib/auth/roles";
import { GATE_APPROVER_ROLES } from "./dependencies";
import type { GateCondition, StageTemplate } from "./template";
import type { StageState, Transition } from "./types";

/**
 * Stage-level RBAC (SPEC §2). The project owner role (OAM) may act on every
 * step; step owners act on their own steps; only the gate approver (OAM)
 * returns, closes or reopens a step. Admin manages users/templates/rules but
 * does not perform process actions.
 */
const APPROVER_ONLY: readonly Transition[] = ["close", "return", "reopen"];

function hasAny(roles: readonly Role[], allowed: readonly Role[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

export function canTransition(roles: readonly Role[], stage: StageTemplate, transition: Transition): boolean {
  if (APPROVER_ONLY.includes(transition)) return hasAny(roles, GATE_APPROVER_ROLES);
  return hasAny(roles, [...stage.ownerRoles, ...GATE_APPROVER_ROLES]);
}

/** Tasks, document links, layout versions, decisions. Closed steps are frozen. */
export function canEditStage(roles: readonly Role[], stage: StageTemplate, state: StageState): boolean {
  if (state === "CLOSED") return false;
  return hasAny(roles, [...stage.ownerRoles, ...GATE_APPROVER_ROLES]);
}

export function canConfirmCheck(
  roles: readonly Role[],
  check: Extract<GateCondition, { type: "manualCheck" }>,
  state: StageState,
): boolean {
  if (state === "CLOSED") return false;
  return hasAny(roles, check.roles);
}

/** Step settings: due date, responsible person, enabling optional steps. */
export function canManageStage(roles: readonly Role[]): boolean {
  return hasAny(roles, GATE_APPROVER_ROLES);
}
