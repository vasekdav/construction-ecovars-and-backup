/**
 * Demo seed (SPEC §10): fictitious users only, one per role.
 * Password comes from SEED_DEMO_PASSWORD; nothing secret is stored in git.
 * Idempotent: existing accounts are left untouched.
 */
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { MIN_PASSWORD_LENGTH } from "../lib/auth/password-policy";
import type { Role } from "../lib/auth/roles";
import {
  addDocumentLink,
  addTask,
  confirmCheck,
  createProject,
  transitionStage,
  updateStageSettings,
  type Actor,
} from "../lib/workflow/service";
import { createDb, type Db } from "./client";
import { auditLog, projects, roleAssignments, stages, users } from "./schema";

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
    await seedDemoProject(db);
  } finally {
    await close();
  }
}

export const DEMO_PROJECT_NAME = "Demo Zákazník, LOX 20 m³";

async function actorFor(db: Db, email: string): Promise<Actor> {
  const rows = await db
    .select({ id: users.id, role: roleAssignments.role })
    .from(users)
    .innerJoin(roleAssignments, eq(roleAssignments.userId, users.id))
    .where(sql`lower(${users.email}) = ${email}`);
  if (!rows.length) throw new Error(`Demo user ${email} missing`);
  return { id: rows[0]!.id, roles: rows.map((r) => r.role) };
}

/** Fictitious demo project, built through the regular services (so it is audited). */
async function seedDemoProject(db: Db) {
  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, DEMO_PROJECT_NAME));
  if (existing) return;
  const oam = await actorFor(db, "oam@demo.local");
  const roc = await actorFor(db, "roc@demo.local");
  const projectId = await createProject(db, oam, {
    name: DEMO_PROJECT_NAME,
    customer: "Demo Zákazník s.r.o.",
    location: "Demo Město (fiktivní)",
    medium: "O2",
  });
  const stageId = async (key: string) => {
    const [s] = await db
      .select({ id: stages.id })
      .from(stages)
      .where(and(eq(stages.projectId, projectId), eq(stages.key, key)));
    return s!.id;
  };
  const s1 = await stageId("1");
  await transitionStage(db, oam, { stageId: s1, transition: "start" });
  await addDocumentLink(db, oam, {
    stageId: s1,
    kind: "sharepoint_site",
    title: "Demo SharePoint site",
    url: "https://demo.sharepoint.com/sites/demo-backup-lox20",
  });
  await confirmCheck(db, oam, { stageId: s1, checkId: "permissions_match_roles", confirmed: true });
  await transitionStage(db, oam, { stageId: s1, transition: "submit" });
  await transitionStage(db, oam, { stageId: s1, transition: "close" });

  const s2 = await stageId("2");
  await transitionStage(db, oam, { stageId: s2, transition: "start" });
  await updateStageSettings(db, oam, { stageId: s2, dueDate: "2026-12-15" });
  await addDocumentLink(db, oam, {
    stageId: s2,
    kind: "pid_ref_lox_dubi",
    title: "Referenční P&ID LOX (demo)",
    url: "https://demo.sharepoint.com/sites/demo-backup-lox20/pid-lox.pdf",
    version: "A",
    documentDate: "2026-10-01",
  });
  await addTask(db, oam, { stageId: s2, title: "Vyžádat CES P&ID od ROC (demo)", assigneeUserId: roc.id, dueDate: "2026-12-01" });
  console.log(`Seeded demo project "${DEMO_PROJECT_NAME}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
