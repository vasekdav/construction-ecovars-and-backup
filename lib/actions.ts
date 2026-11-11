import { z } from "zod";
import { actionLimiter } from "@/lib/rate-limit";
import { can, ForbiddenError, type Permission } from "@/lib/auth/rbac";
import { getCurrentUser, logForbidden, type CurrentUser } from "@/lib/auth/session";

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionState =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors }
  | null;

/** Codes that a domain error may expose to the UI (translated under `errors.*`). */
export class DomainError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/**
 * Common server-action guard: authentication, RBAC (server-side), rate limit,
 * error mapping. Denied attempts are written to the audit log.
 */
export async function guardedAction(
  permission: Permission,
  run: (user: CurrentUser) => Promise<ActionState>,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "forbidden" };
  if (!actionLimiter.consume(user.id).allowed) return { ok: false, error: "rateLimited" };
  if (!can(user.roles, permission)) {
    await logForbidden(user.id, permission);
    return { ok: false, error: "forbidden" };
  }
  try {
    return await run(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: "validation", fieldErrors: z.flattenError(err).fieldErrors as FieldErrors };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    if (err instanceof DomainError) return { ok: false, error: err.code };
    if (err instanceof Error && "code" in err && typeof err.code === "string" && err.name.endsWith("ServiceError")) {
      return { ok: false, error: err.code };
    }
    console.error(err);
    return { ok: false, error: "unknown" };
  }
}
