import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db/client";
import { rules } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/rbac";
import { parseLocaleNumber } from "@/lib/questionnaire/answers";
import { missingParameters, ruleSchema, TBD, type Rule } from "@/lib/rules/rule";
import { dimensionOf, isUnit, quantity } from "@/lib/units";
import type { Medium } from "@/lib/workflow/template";
import { SafetyServiceError, type Actor } from "./errors";

export interface StoredRule {
  rule: Rule;
  status: "DRAFT" | "VERIFIED";
  verifiedBy: string | null;
  verifiedAt: Date | null;
  changeNote: string | null;
  createdAt: Date;
}

function toStored(row: typeof rules.$inferSelect): StoredRule {
  const rule: Rule = {
    ...row.definition,
    version: row.version,
    status: row.status,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
  return {
    rule,
    status: row.status,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    changeNote: row.changeNote,
    createdAt: row.createdAt,
  };
}

/** Insert rule files whose (id, version) is not in the DB yet. Existing versions are never touched. */
export async function syncRules(db: Db, files: readonly Rule[]): Promise<number> {
  let inserted = 0;
  for (const r of files) {
    const res = await db
      .insert(rules)
      .values({ id: r.id, version: r.version, definition: r, status: "DRAFT", changeNote: "import data/rules" })
      .onConflictDoNothing()
      .returning({ id: rules.id });
    inserted += res.length;
  }
  return inserted;
}

/** Latest version of every rule. */
export async function listCurrentRules(db: DbOrTx): Promise<StoredRule[]> {
  const rows = await db
    .selectDistinctOn([rules.id])
    .from(rules)
    .orderBy(rules.id, desc(rules.version));
  return rows.map(toStored);
}

export async function getRuleHistory(db: DbOrTx, id: string): Promise<StoredRule[]> {
  const rows = await db.select().from(rules).where(eq(rules.id, id)).orderBy(desc(rules.version));
  return rows.map(toStored);
}

const quantityInput = z.object({ input: z.union([z.string(), z.number()]), unit: z.string() }).nullable();

const updateSchema = z.object({
  ruleId: z.string().min(1),
  /** paramKey → medium → value (null clears it back to TBD-VERIFY) */
  parameters: z.record(z.string(), z.partialRecord(z.enum(["O2", "N2"]), quantityInput)).default({}),
  source: z.object({ document: z.string().trim().min(1).max(300), clause: z.string().trim().min(1).max(300) }).optional(),
  changeNote: z.string().trim().min(1).max(1000),
});

/**
 * Change parameters and/or source citation. Always creates a new DRAFT
 * version (the previous verification does not carry over).
 */
export async function updateRule(db: Db, actor: Actor, input: unknown): Promise<number> {
  assertCan(actor.roles, "rule.manage");
  const data = updateSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.ruleId}))`);
    const [latest] = await tx.select().from(rules).where(eq(rules.id, data.ruleId)).orderBy(desc(rules.version)).limit(1);
    if (!latest) throw new SafetyServiceError("NOT_FOUND");
    const def: Rule = structuredClone(latest.definition);
    const errors: string[] = [];
    for (const [key, perMedium] of Object.entries(data.parameters)) {
      const p = def.parameters.find((x) => x.key === key);
      if (!p) {
        errors.push(key);
        continue;
      }
      for (const [m, raw] of Object.entries(perMedium) as [Medium, z.infer<typeof quantityInput>][]) {
        if (!def.appliesTo.includes(m)) {
          errors.push(`${key}.${m}`);
          continue;
        }
        if (raw === null || String(raw.input).trim() === "") {
          p.values[m] = null;
          continue;
        }
        const n = parseLocaleNumber(raw.input);
        if (n === null || !isUnit(raw.unit) || dimensionOf(raw.unit) !== p.dimension) {
          errors.push(`${key}.${m}`);
          continue;
        }
        p.values[m] = quantity(n, raw.unit);
      }
    }
    if (errors.length) throw new SafetyServiceError("INVALID_UNIT", errors);
    if (data.source) def.source = data.source;
    const version = latest.version + 1;
    const next = ruleSchema.safeParse({ ...def, version, status: "DRAFT", verifiedBy: null, verifiedAt: null });
    if (!next.success) throw new SafetyServiceError("INVALID_RULE", [next.error.message]);
    await tx.insert(rules).values({
      id: data.ruleId,
      version,
      definition: next.data,
      status: "DRAFT",
      changeNote: data.changeNote,
      createdBy: actor.id,
    });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "rule.update",
      entityType: "rule",
      entityId: `${data.ruleId}@${version}`,
      before: { version: latest.version, status: latest.status, parameters: latest.definition.parameters, source: latest.definition.source },
      after: { version, status: "DRAFT", parameters: next.data.parameters, source: next.data.source },
      reason: data.changeNote,
    });
    return version;
  });
}

/**
 * Process Safety marks one rule version VERIFIED. Requires the latest
 * version, all parameters filled for every applicable medium and a concrete
 * source clause (no TBD-VERIFY left).
 */
export async function verifyRule(db: Db, actor: Actor, input: unknown): Promise<void> {
  assertCan(actor.roles, "rule.verify");
  const data = z.object({ ruleId: z.string().min(1), version: z.number().int().min(1) }).parse(input);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.ruleId}))`);
    const [latest] = await tx.select().from(rules).where(eq(rules.id, data.ruleId)).orderBy(desc(rules.version)).limit(1);
    if (!latest) throw new SafetyServiceError("NOT_FOUND");
    if (latest.version !== data.version) throw new SafetyServiceError("NOT_LATEST_VERSION");
    if (latest.status === "VERIFIED") throw new SafetyServiceError("ALREADY_VERIFIED");
    const missing = missingParameters(latest.definition);
    if (missing.length) throw new SafetyServiceError("MISSING_PARAMETERS", missing);
    if (latest.definition.source.clause.includes(TBD) || latest.definition.source.document.includes(TBD)) {
      throw new SafetyServiceError("SOURCE_TBD");
    }
    const now = new Date();
    await tx
      .update(rules)
      .set({ status: "VERIFIED", verifiedBy: actor.id, verifiedAt: now })
      .where(and(eq(rules.id, data.ruleId), eq(rules.version, data.version)));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "rule.verify",
      entityType: "rule",
      entityId: `${data.ruleId}@${data.version}`,
      before: { status: "DRAFT" },
      after: { status: "VERIFIED", verifiedAt: now.toISOString() },
    });
  });
}
