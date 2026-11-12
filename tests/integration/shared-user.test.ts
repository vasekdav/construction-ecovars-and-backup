import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { SHARED_USER_EMAIL } from "@/lib/auth/mode";
import { ROLES } from "@/lib/auth/roles";
import { ensureSharedUser, resetSharedUserCache } from "@/lib/auth/shared-user";
import { authenticate, getUserWithRoles } from "@/lib/users/service";
import { hasDb, setupTestDb } from "./db";

describe.skipIf(!hasDb)("shared user of the open mode (Postgres)", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    resetSharedUserCache();
  });
  afterAll(async () => close?.());

  it("is created once with all roles and cannot sign in with a password", async () => {
    const [a, b] = await Promise.all([ensureSharedUser(db), ensureSharedUser(db)]);
    resetSharedUserCache();
    const c = await ensureSharedUser(db);
    expect(a).toBe(b);
    expect(c).toBe(a);
    const rows = await db.select().from(users).where(sql`lower(${users.email}) = ${SHARED_USER_EMAIL}`);
    expect(rows).toHaveLength(1);
    const u = await getUserWithRoles(db, a);
    expect(u?.roles).toEqual([...ROLES].sort());
    expect(await authenticate(db, SHARED_USER_EMAIL, "anything")).toBeNull();
    const created = await db.select().from(auditLog).where(eq(auditLog.action, "user.create_shared"));
    expect(created.length).toBeGreaterThanOrEqual(1);
  });
});
