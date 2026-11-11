/**
 * Demo seed (SPEC §10): fictitious users only, one per role.
 * Password comes from SEED_DEMO_PASSWORD; nothing secret is stored in git.
 * Idempotent: existing accounts are left untouched.
 */
import { sql } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { MIN_PASSWORD_LENGTH } from "../lib/auth/password-policy";
import type { Role } from "../lib/auth/roles";
import { createDb } from "./client";
import { auditLog, roleAssignments, users } from "./schema";

export const DEMO_USERS: { email: string; name: string; roles: Role[] }[] = [
  { email: "admin@demo.local", name: "Demo Admin", roles: ["ADMIN"] },
  { email: "oam@demo.local", name: "Demo OAM", roles: ["OAM"] },
  { email: "ops@demo.local", name: "Demo OPS", roles: ["OPS"] },
  { email: "investment@demo.local", name: "Demo Investment", roles: ["INVESTMENT"] },
  { email: "roc@demo.local", name: "Demo ROC Třinec", roles: ["ROC"] },
  { email: "safety@demo.local", name: "Demo Process Safety", roles: ["PROCESS_SAFETY"] },
  { email: "sizing@demo.local", name: "Demo Sizing", roles: ["SIZING"] },
];

async function main() {
  const url = process.env.DATABASE_URL;
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SEED_DEMO_PASSWORD must be set (min ${MIN_PASSWORD_LENGTH} characters)`);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo users in production (set ALLOW_DEMO_SEED=true to override).");
  }

  const { db, close } = createDb(url, { max: 1 });
  try {
    const passwordHash = await hashPassword(password);
    for (const u of DEMO_USERS) {
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${u.email}`);
        if (existing) return;
        const [created] = await tx
          .insert(users)
          .values({ email: u.email, name: u.name, passwordHash })
          .returning({ id: users.id });
        if (!created) throw new Error("insert failed");
        await tx.insert(roleAssignments).values(u.roles.map((role) => ({ userId: created.id, role })));
        await tx.insert(auditLog).values({
          actorUserId: null,
          action: "seed.user_create",
          entityType: "user",
          entityId: created.id,
          after: { email: u.email, name: u.name, roles: u.roles },
        });
        console.log(`Seeded ${u.email}`);
      });
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
