/**
 * Authentication mode (ADR-039).
 *  - "open" (default): no sign-in; everybody works as one shared user that has all roles.
 *    Only for fictitious data (SPEC §10).
 *  - "password": admin-managed accounts with passwords (Auth.js), per-person roles and audit.
 * Switch with the environment variable AUTH_MODE=password.
 */
export type AuthMode = "open" | "password";

export function authMode(env: Record<string, string | undefined> = process.env): AuthMode {
  return env.AUTH_MODE?.trim().toLowerCase() === "password" ? "password" : "open";
}

export const SHARED_USER_EMAIL = "shared-access@local.invalid";
export const SHARED_USER_NAME = "Sdílený uživatel";
