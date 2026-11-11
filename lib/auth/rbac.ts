import type { Role } from "./roles";

/**
 * Permission matrix (SPEC §2). Data, not scattered `if`s: every server-side
 * check goes through `can()` / `requirePermission()`.
 *
 * Stage-level write permissions (step owners) are resolved in phase 1 on top
 * of this matrix.
 */
export const PERMISSIONS = {
  "user.manage": ["ADMIN"],
  "audit.read": ["ADMIN", "PROCESS_SAFETY"],
  "project.read": ["OAM", "OPS", "INVESTMENT", "ROC", "PROCESS_SAFETY", "SIZING", "ADMIN"],
  "project.create": ["OAM", "ADMIN"],
  "template.manage": ["ADMIN"],
  "rule.manage": ["ADMIN", "PROCESS_SAFETY"],
  "rule.verify": ["PROCESS_SAFETY"],
  "rule.override": ["PROCESS_SAFETY"],
  "rule.acknowledge": ["PROCESS_SAFETY", "OAM"],
  "standard.verify": ["PROCESS_SAFETY"],
  "questionnaire.write": ["OAM"],
  "sizing.write": ["SIZING"],
  "design.write": ["OAM", "OPS", "ROC", "PROCESS_SAFETY", "SIZING"],
  "safety.snapshot": ["OAM", "PROCESS_SAFETY"],
  "equipment.write": ["INVESTMENT"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((r) => allowed.includes(r));
}

export class ForbiddenError extends Error {
  /** A global permission or a stage-level action such as `stage.close:4`. */
  constructor(
    public readonly permission: string,
    public readonly projectId?: string,
  ) {
    super(`Forbidden: missing permission ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(roles: readonly Role[], permission: Permission): void {
  if (!can(roles, permission)) throw new ForbiddenError(permission);
}
