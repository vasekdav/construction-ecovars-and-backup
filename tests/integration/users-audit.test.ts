import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/rbac";
import {
  authenticate,
  createUser,
  getUserWithRoles,
  listUsers,
  setUserPassword,
  updateUser,
  UserServiceError,
  type Actor,
} from "@/lib/users/service";
import { hasDb, setupTestDb, uniqueEmail } from "./db";

describe.skipIf(!hasDb)("users + audit log (Postgres)", () => {
  let db: Db;
  let close: () => Promise<void>;
  let admin: Actor;

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    // Bootstrap an admin directly (no actor exists yet), then use the service.
    const [u] = await db
      .insert(users)
      .values({ email: uniqueEmail("admin"), name: "Test Admin", passwordHash: "x" })
      .returning({ id: users.id });
    admin = { id: u!.id, roles: ["ADMIN"] };
  });

  afterAll(async () => {
    await close?.();
  });

  it("creates a user with roles and writes an audit entry", async () => {
    const email = uniqueEmail("oam");
    const id = await createUser(db, admin, { email, name: "OAM User", password: "a-long-password", roles: ["OAM"] });
    const u = await getUserWithRoles(db, id);
    expect(u).toMatchObject({ email, name: "OAM User", active: true, roles: ["OAM"] });

    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, id), eq(auditLog.action, "user.create")));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.actorUserId).toBe(admin.id);
    expect(JSON.stringify(entries[0]!.after)).not.toContain("password");
  });

  it("rejects duplicate e-mails case-insensitively", async () => {
    const email = uniqueEmail("dup");
    await createUser(db, admin, { email, name: "A", password: "a-long-password", roles: [] });
    await expect(
      createUser(db, admin, { email: email.toUpperCase(), name: "B", password: "a-long-password", roles: [] }),
    ).rejects.toThrow(UserServiceError);
  });

  it("enforces RBAC on the server side", async () => {
    const ops: Actor = { id: admin.id, roles: ["OPS"] };
    await expect(
      createUser(db, ops, { email: uniqueEmail("x"), name: "X", password: "a-long-password", roles: [] }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("updates roles/active with before/after in the audit log", async () => {
    const id = await createUser(db, admin, { email: uniqueEmail("ops"), name: "O", password: "a-long-password", roles: ["OPS"] });
    await updateUser(db, admin, { userId: id, roles: ["OPS", "ROC"], active: false });
    const u = await getUserWithRoles(db, id);
    expect(u).toMatchObject({ roles: ["OPS", "ROC"], active: false });
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, id), eq(auditLog.action, "user.update")));
    expect(entry?.before).toEqual({ roles: ["OPS"], active: true });
    expect(entry?.after).toEqual({ roles: ["OPS", "ROC"], active: false });
  });

  it("does not write an audit entry for a no-op update", async () => {
    const id = await createUser(db, admin, { email: uniqueEmail("noop"), name: "N", password: "a-long-password", roles: ["OPS"] });
    await updateUser(db, admin, { userId: id, roles: ["OPS"], active: true });
    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, id), eq(auditLog.action, "user.update")));
    expect(entries).toHaveLength(0);
  });

  it("prevents an admin from locking themselves out", async () => {
    await expect(updateUser(db, admin, { userId: admin.id, roles: ["OPS"], active: true })).rejects.toThrow(
      UserServiceError,
    );
    await expect(updateUser(db, admin, { userId: admin.id, roles: ["ADMIN"], active: false })).rejects.toThrow(
      UserServiceError,
    );
  });

  it("returns NOT_FOUND for unknown users", async () => {
    const missing = "11111111-1111-4111-8111-111111111111";
    await expect(updateUser(db, admin, { userId: missing, roles: [], active: true })).rejects.toThrow("NOT_FOUND");
    await expect(setUserPassword(db, admin, { userId: missing, password: "a-long-password" })).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("authenticates active users only and supports password reset", async () => {
    const email = uniqueEmail("login");
    const id = await createUser(db, admin, { email, name: "L", password: "first-password-1", roles: ["OAM"] });
    expect(await authenticate(db, email.toUpperCase(), "first-password-1")).toBe(id);
    expect(await authenticate(db, email, "wrong-password-1")).toBeNull();
    expect(await authenticate(db, uniqueEmail("nobody"), "first-password-1")).toBeNull();

    await setUserPassword(db, admin, { userId: id, password: "second-password-2" });
    expect(await authenticate(db, email, "first-password-1")).toBeNull();
    expect(await authenticate(db, email, "second-password-2")).toBe(id);

    await updateUser(db, admin, { userId: id, roles: ["OAM"], active: false });
    expect(await authenticate(db, email, "second-password-2")).toBeNull();
  });

  it("lists users with aggregated roles", async () => {
    const all = await listUsers(db);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((u) => Array.isArray(u.roles))).toBe(true);
  });

  it("audit log is append-only: UPDATE, DELETE and TRUNCATE are rejected", async () => {
    const [row] = await db
      .insert(auditLog)
      .values({ actorUserId: null, action: "test.append", entityType: "test" })
      .returning({ id: auditLog.id });
    const pgMessage = async (p: Promise<unknown>) => {
      try {
        await p;
        return "no error";
      } catch (e) {
        const err = e as Error & { cause?: Error };
        return `${err.message} ${err.cause?.message ?? ""}`;
      }
    };
    expect(await pgMessage(db.update(auditLog).set({ action: "x" }).where(eq(auditLog.id, row!.id)))).toMatch(
      /append-only \(UPDATE rejected\)/,
    );
    expect(await pgMessage(db.delete(auditLog).where(eq(auditLog.id, row!.id)))).toMatch(
      /append-only \(DELETE rejected\)/,
    );
    expect(await pgMessage(db.execute(sql`TRUNCATE audit_log`))).toMatch(/append-only \(TRUNCATE rejected\)/);
  });
});
