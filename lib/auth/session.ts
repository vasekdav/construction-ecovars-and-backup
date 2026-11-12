import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { writeAudit } from "@/lib/audit";
import { authMode } from "./mode";
import { authOptions } from "./options";
import { ensureSharedUser } from "./shared-user";
import { can, type Permission } from "./rbac";
import { getUserWithRoles, type UserWithRoles } from "@/lib/users/service";

export type CurrentUser = UserWithRoles;

/**
 * The signed-in user, re-read from the DB on every request so that
 * deactivation and role changes take effect immediately.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (authMode() === "open") {
    // Open mode (ADR-039): everybody is the shared user with all roles.
    const db = await getDb();
    return getUserWithRoles(db, await ensureSharedUser(db));
  }
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return null;
  const user = await getUserWithRoles(await getDb(), uid);
  return user?.active ? user : null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Server-side RBAC guard for pages. Denied attempts are audited. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.roles, permission)) {
    await logForbidden(user.id, permission);
    redirect("/forbidden");
  }
  return user;
}

export async function logForbidden(userId: string, permission: string, projectId?: string): Promise<void> {
  await writeAudit(await getDb(), {
    actorUserId: userId,
    action: "security.forbidden",
    entityType: "permission",
    entityId: permission,
    projectId: projectId ?? null,
  });
}
