import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db/client";
import { calcConfigs } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/rbac";
import { parseLocaleNumber } from "@/lib/questionnaire/answers";
import { SafetyServiceError, type Actor } from "@/lib/safety/errors";
import { dimensionOf, isUnit, quantity } from "@/lib/units";
import type { Medium } from "@/lib/workflow/template";
import { calcConfigGaps, calcConfigSchema, type CalcConfig } from "./config";

export const AUTONOMY_KEY = "autonomy";

export interface StoredCalcConfig {
  config: CalcConfig;
  status: "DRAFT" | "VERIFIED";
  verifiedBy: string | null;
  verifiedAt: Date | null;
  changeNote: string | null;
  createdAt: Date;
}

function toStored(row: typeof calcConfigs.$inferSelect): StoredCalcConfig {
  return {
    config: { ...row.definition, version: row.version, status: row.status, verifiedBy: row.verifiedBy, verifiedAt: row.verifiedAt?.toISOString() ?? null },
    status: row.status,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    changeNote: row.changeNote,
    createdAt: row.createdAt,
  };
}

export async function syncCalcConfigs(db: Db, configs: readonly CalcConfig[]): Promise<number> {
  let n = 0;
  for (const c of configs) {
    const res = await db
      .insert(calcConfigs)
      .values({ key: c.key, version: c.version, definition: c, changeNote: "import data/calc" })
      .onConflictDoNothing()
      .returning({ key: calcConfigs.key });
    n += res.length;
  }
  return n;
}

export async function getCalcConfigHistory(db: DbOrTx, key: string): Promise<StoredCalcConfig[]> {
  const rows = await db.select().from(calcConfigs).where(eq(calcConfigs.key, key)).orderBy(desc(calcConfigs.version));
  return rows.map(toStored);
}

export async function getCurrentCalcConfig(db: DbOrTx, key: string): Promise<StoredCalcConfig | null> {
  return (await getCalcConfigHistory(db, key))[0] ?? null;
}

const qInput = z.object({ input: z.union([z.string(), z.number()]), unit: z.string() }).nullable();
const updateSchema = z.object({
  key: z.string().min(1),
  parameters: z.record(z.string(), z.partialRecord(z.enum(["O2", "N2"]), qInput)).default({}),
  normalConditions: z.string().trim().min(1).max(300),
  source: z.object({ document: z.string().trim().min(1).max(300), clause: z.string().trim().min(1).max(300) }),
  changeNote: z.string().trim().min(1).max(1000),
});

/** Every change creates a new DRAFT version (verification does not carry over). */
export async function updateCalcConfig(db: Db, actor: Actor, input: unknown): Promise<number> {
  assertCan(actor.roles, "rule.manage");
  const data = updateSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"calc:" + data.key}))`);
    const [latest] = await tx.select().from(calcConfigs).where(eq(calcConfigs.key, data.key)).orderBy(desc(calcConfigs.version)).limit(1);
    if (!latest) throw new SafetyServiceError("NOT_FOUND");
    const def: CalcConfig = structuredClone(latest.definition);
    const errors: string[] = [];
    for (const [key, perMedium] of Object.entries(data.parameters)) {
      const p = def.parameters.find((x) => x.key === key);
      if (!p) {
        errors.push(key);
        continue;
      }
      for (const [m, raw] of Object.entries(perMedium) as [Medium, z.infer<typeof qInput>][]) {
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
    const version = latest.version + 1;
    const next = calcConfigSchema.parse({
      ...def,
      version,
      normalConditions: data.normalConditions,
      source: data.source,
      status: "DRAFT",
      verifiedBy: null,
      verifiedAt: null,
    });
    await tx.insert(calcConfigs).values({ key: data.key, version, definition: next, changeNote: data.changeNote, createdBy: actor.id });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "calc.update",
      entityType: "calc_config",
      entityId: `${data.key}@${version}`,
      before: { version: latest.version, parameters: latest.definition.parameters, normalConditions: latest.definition.normalConditions, source: latest.definition.source },
      after: { version, parameters: next.parameters, normalConditions: next.normalConditions, source: next.source },
      reason: data.changeNote,
    });
    return version;
  });
}

export async function verifyCalcConfig(db: Db, actor: Actor, input: unknown): Promise<void> {
  assertCan(actor.roles, "rule.verify");
  const data = z.object({ key: z.string().min(1), version: z.number().int().min(1) }).parse(input);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"calc:" + data.key}))`);
    const [latest] = await tx.select().from(calcConfigs).where(eq(calcConfigs.key, data.key)).orderBy(desc(calcConfigs.version)).limit(1);
    if (!latest) throw new SafetyServiceError("NOT_FOUND");
    if (latest.version !== data.version) throw new SafetyServiceError("NOT_LATEST_VERSION");
    if (latest.status === "VERIFIED") throw new SafetyServiceError("ALREADY_VERIFIED");
    const gaps = calcConfigGaps(latest.definition);
    if (gaps.length) throw new SafetyServiceError("MISSING_PARAMETERS", gaps);
    const now = new Date();
    await tx
      .update(calcConfigs)
      .set({ status: "VERIFIED", verifiedBy: actor.id, verifiedAt: now })
      .where(and(eq(calcConfigs.key, data.key), eq(calcConfigs.version, data.version)));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "calc.verify",
      entityType: "calc_config",
      entityId: `${data.key}@${data.version}`,
      after: { status: "VERIFIED", verifiedAt: now.toISOString() },
    });
  });
}
