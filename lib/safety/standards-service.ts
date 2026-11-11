import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db/client";
import { standards } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/rbac";
import { MEDIA, type Localized, type Medium } from "@/lib/workflow/template";
import { SafetyServiceError, type Actor } from "./errors";

export interface StandardCandidate {
  code: string;
  title: Localized;
  revision: string | null;
  appliesTo: Medium[];
}

/** Insert candidate standards that are not in the DB yet (by code). */
export async function syncStandards(db: Db, candidates: readonly StandardCandidate[]): Promise<number> {
  let inserted = 0;
  for (const c of candidates) {
    const res = await db
      .insert(standards)
      .values({ code: c.code, titleCs: c.title.cs, titleEn: c.title.en, revision: c.revision, appliesTo: c.appliesTo })
      .onConflictDoNothing()
      .returning({ id: standards.id });
    inserted += res.length;
  }
  return inserted;
}

export async function listStandards(db: DbOrTx) {
  return db.select().from(standards).orderBy(asc(standards.code));
}

const updateSchema = z.object({
  standardId: z.uuid(),
  revision: z.string().trim().max(120).transform((v) => (v === "" ? null : v)),
  notes: z.string().trim().max(2000).transform((v) => (v === "" ? null : v)),
  appliesTo: z.array(z.enum(MEDIA)).min(1),
});

/** Editing a standard resets it to DRAFT. */
export async function updateStandard(db: Db, actor: Actor, input: unknown): Promise<void> {
  assertCan(actor.roles, "rule.manage");
  const data = updateSchema.parse(input);
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(standards).where(eq(standards.id, data.standardId)).for("update");
    if (!s) throw new SafetyServiceError("NOT_FOUND");
    await tx
      .update(standards)
      .set({ revision: data.revision, notes: data.notes, appliesTo: data.appliesTo, status: "DRAFT", verifiedBy: null, verifiedAt: null, updatedAt: new Date() })
      .where(eq(standards.id, s.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "standard.update",
      entityType: "standard",
      entityId: s.code,
      before: { revision: s.revision, notes: s.notes, appliesTo: s.appliesTo, status: s.status },
      after: { revision: data.revision, notes: data.notes, appliesTo: data.appliesTo, status: "DRAFT" },
    });
  });
}

export async function verifyStandard(db: Db, actor: Actor, input: unknown): Promise<void> {
  assertCan(actor.roles, "standard.verify");
  const { standardId } = z.object({ standardId: z.uuid() }).parse(input);
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(standards).where(eq(standards.id, standardId)).for("update");
    if (!s) throw new SafetyServiceError("NOT_FOUND");
    if (s.status === "VERIFIED") throw new SafetyServiceError("ALREADY_VERIFIED");
    if (!s.revision) throw new SafetyServiceError("REVISION_MISSING");
    const now = new Date();
    await tx.update(standards).set({ status: "VERIFIED", verifiedBy: actor.id, verifiedAt: now, updatedAt: now }).where(eq(standards.id, s.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "standard.verify",
      entityType: "standard",
      entityId: s.code,
      after: { revision: s.revision, status: "VERIFIED" },
    });
  });
}
