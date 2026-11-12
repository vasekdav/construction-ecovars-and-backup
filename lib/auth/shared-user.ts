import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog, roleAssignments, users } from "@/db/schema";
import { SHARED_USER_EMAIL, SHARED_USER_NAME } from "./mode";
import { ROLES } from "./roles";

const cache = globalThis as unknown as { __hubSharedUserId?: string | undefined };

/**
 * The shared user of the open mode (ADR-039): created on first use with all
 * roles. Its password hash is not a valid scrypt hash, so nobody can sign in
 * with it in password mode. Idempotent and safe under concurrency.
 */
export async function ensureSharedUser(db: Db): Promise<string> {
  if (cache.__hubSharedUserId) return cache.__hubSharedUserId;
  const find = async () =>
    (await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${SHARED_USER_EMAIL}`))[0]?.id;
  let id = await find();
  if (!id) {
    const inserted = await db
      .insert(users)
      .values({ email: SHARED_USER_EMAIL, name: SHARED_USER_NAME, passwordHash: `disabled$${randomBytes(16).toString("hex")}` })
      .onConflictDoNothing()
      .returning({ id: users.id });
    id = inserted[0]?.id ?? (await find());
    if (!id) throw new Error("shared user could not be created");
    if (inserted[0]) {
      const userId = id;
      await db.insert(roleAssignments).values(ROLES.map((role) => ({ userId, role }))).onConflictDoNothing();
      await db.insert(auditLog).values({
        actorUserId: null,
        action: "user.create_shared",
        entityType: "user",
        entityId: userId,
        after: { email: SHARED_USER_EMAIL, roles: ROLES, mode: "open" },
      });
    }
  }
  cache.__hubSharedUserId = id;
  return id;
}

/** Test helper: forget the cached id (e.g. a fresh test database). */
export function resetSharedUserCache(): void {
  cache.__hubSharedUserId = undefined;
}
