import type { Role } from "@/lib/auth/roles";

export interface Actor {
  id: string;
  roles: readonly Role[];
}

export type SafetyErrorCode =
  | "NOT_FOUND"
  | "NOT_LATEST_VERSION"
  | "ALREADY_VERIFIED"
  | "MISSING_PARAMETERS"
  | "SOURCE_TBD"
  | "REVISION_MISSING"
  | "INVALID_UNIT"
  | "INVALID_RULE"
  | "NOT_NO_GO"
  | "ALREADY_OVERRIDDEN"
  | "NOT_WARNING"
  | "ALREADY_ACKNOWLEDGED"
  | "STAGE_CLOSED"
  | "NO_LAYOUT_VERSION";

export class SafetyServiceError extends Error {
  override name = "SafetyServiceError";
  constructor(
    public readonly code: SafetyErrorCode,
    public readonly details: string[] = [],
  ) {
    super(code);
  }
}

/** Field-level validation errors of a form-based input (layout geometry, design checklist). */
export class FormValidationError extends Error {
  override name = "FormValidationError";
  constructor(public readonly errors: Record<string, string>) {
    super("validation");
  }
}
