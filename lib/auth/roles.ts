/** Application roles (SPEC §2). Pure module: no DB/UI imports. */
export const ROLES = [
  "OAM",
  "OPS",
  "INVESTMENT",
  "ROC",
  "PROCESS_SAFETY",
  "SIZING",
  "ADMIN",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
