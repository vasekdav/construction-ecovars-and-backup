import { asc, eq, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { roleAssignments, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { assertCan } from "@/lib/auth/rbac";
import { isRole, type Role } from "@/lib/auth/roles";
import {
  createUserSchema,
  setPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "./schemas";

export interface Actor {
  id: string;
  roles: readonly Role[];
}

export interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  active: boolean;
  roles: Role[];
  createdAt: Date;
}

export class UserServiceError extends Error {
  constructor(public readonly code: "EMAIL_TAKEN" | "NOT_FOUND" | "SELF_LOCKOUT") {
    super(code);
    this.name = "UserServiceError";
  }
}

function sortRoles(roles: Iterable<Role>): Role[] {
  return [...new Set(roles)].sort();
}

export async function getUserWithRoles(db: DbOrTx, userId: string): Promise<UserWithRoles | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      active: users.active,
      createdAt: users.createdAt,
      role: roleAssignments.role,
    })
    .from(users)
    .leftJoin(roleAssignments, eq(roleAssignments.userId, users.id))
    .where(eq(users.id, userId));
  const first = rows[0];
  if (!first) return null;
  return {
    id: first.id,
    email: first.email,
    name: first.name,
    active: first.active,
    createdAt: first.createdAt,
    roles: sortRoles(rows.map((r) => r.role).filter(isRole)),
  };
}

export async function listUsers(db: Db): Promise<UserWithRoles[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      active: users.active,
      createdAt: users.createdAt,
      role: roleAssignments.role,
    })
    .from(users)
    .leftJoin(roleAssignments, eq(roleAssignments.userId, users.id))
    .orderBy(asc(users.email));
  const byId = new Map<string, UserWithRoles>();
  for (const r of rows) {
    let u = byId.get(r.id);
    if (!u) {
      u = { id: r.id, email: r.email, name: r.name, active: r.active, createdAt: r.createdAt, roles: [] };
      byId.set(r.id, u);
    }
    if (isRole(r.role)) u.roles.push(r.role);
  }
  return [...byId.values()].map((u) => ({ ...u, roles: sortRoles(u.roles) }));
}

/** Returns the user id when email + password match an active account. */
export async function authenticate(db: Db, email: string, password: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, active: users.active })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (!row || !row.active) return null;
  return (await verifyPassword(password, row.passwordHash)) ? row.id : null;
}

export async function createUser(db: Db, actor: Actor, input: CreateUserInput): Promise<string> {
  assertCan(actor.roles, "user.manage");
  const data = createUserSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${data.email}`);
    if (existing) throw new UserServiceError("EMAIL_TAKEN");
    const [created] = await tx
      .insert(users)
      .values({ email: data.email, name: data.name, passwordHash })
      .returning({ id: users.id });
    if (!created) throw new Error("insert failed");
    const roles = sortRoles(data.roles);
    if (roles.length) {
      await tx.insert(roleAssignments).values(roles.map((role) => ({ userId: created.id, role })));
    }
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "user.create",
      entityType: "user",
      entityId: created.id,
      after: { email: data.email, name: data.name, roles, active: true },
    });
    return created.id;
  });
}

export async function updateUser(db: Db, actor: Actor, input: UpdateUserInput): Promise<void> {
  assertCan(actor.roles, "user.manage");
  const data = updateUserSchema.parse(input);
  const roles = sortRoles(data.roles);
  if (data.userId === actor.id && (!data.active || !roles.includes("ADMIN"))) {
    throw new UserServiceError("SELF_LOCKOUT");
  }
  await db.transaction(async (tx) => {
    const before = await getUserWithRoles(tx, data.userId);
    if (!before) throw new UserServiceError("NOT_FOUND");
    await tx.update(users).set({ active: data.active, updatedAt: new Date() }).where(eq(users.id, data.userId));
    await tx.delete(roleAssignments).where(eq(roleAssignments.userId, data.userId));
    if (roles.length) {
      await tx.insert(roleAssignments).values(roles.map((role) => ({ userId: data.userId, role })));
    }
    const unchanged =
      before.active === data.active && before.roles.join(",") === roles.join(",");
    if (!unchanged) {
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "user.update",
        entityType: "user",
        entityId: data.userId,
        before: { roles: before.roles, active: before.active },
        after: { roles, active: data.active },
      });
    }
  });
}

export async function setUserPassword(
  db: Db,
  actor: Actor,
  input: { userId: string; password: string },
): Promise<void> {
  assertCan(actor.roles, "user.manage");
  const data = setPasswordSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, data.userId))
      .returning({ id: users.id });
    if (!updated.length) throw new UserServiceError("NOT_FOUND");
    // Never log the password or its hash.
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "user.password_set",
      entityType: "user",
      entityId: data.userId,
    });
  });
}
