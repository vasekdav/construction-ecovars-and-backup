import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db/client";
import { designBases, projects, sizingResults, stages, type Project } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can, ForbiddenError } from "@/lib/auth/rbac";
import { computeAutonomy, type AutonomyResult } from "@/lib/calc/autonomy";
import { calcParamValues } from "@/lib/calc/config";
import { AUTONOMY_KEY, getCurrentCalcConfig, type StoredCalcConfig } from "@/lib/calc/config-service";
import { SIZING_RESULT_FORM } from "@/lib/forms";
import { isQuantity, type Answers } from "@/lib/questionnaire/answers";
import { applyRawAnswers } from "@/lib/questionnaire/apply";
import { completeness } from "@/lib/questionnaire/completeness";
import { FormValidationError, SafetyServiceError, type Actor } from "@/lib/safety/errors";

/** Stage whose gate checks the sizing result. */
const SIZING_STAGE = "8";

export async function getSizingHistory(db: DbOrTx, projectId: string) {
  return db.select().from(sizingResults).where(eq(sizingResults.projectId, projectId)).orderBy(desc(sizingResults.version));
}

export async function getLatestSizing(db: DbOrTx, projectId: string) {
  return (await getSizingHistory(db, projectId))[0] ?? null;
}

/**
 * Record a new sizing result version. Records are immutable and must be
 * complete: inputs, result and source (file, revision, author, date).
 */
export async function recordSizingResult(db: Db, actor: Actor, input: unknown): Promise<number> {
  const data = z.object({ projectId: z.uuid(), answers: z.record(z.string().max(80), z.unknown()) }).parse(input);
  if (!can(actor.roles, "sizing.write")) throw new ForbiddenError("sizing.write", data.projectId);
  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, data.projectId)).for("update");
    if (!project) throw new SafetyServiceError("NOT_FOUND");
    const [st] = await tx
      .select({ state: stages.state })
      .from(stages)
      .where(and(eq(stages.projectId, project.id), eq(stages.key, SIZING_STAGE)));
    if (st?.state === "CLOSED") throw new SafetyServiceError("STAGE_CLOSED");
    const { next, errors } = applyRawAnswers(SIZING_RESULT_FORM, {}, data.answers);
    const c = completeness(SIZING_RESULT_FORM, { medium: project.medium, answers: next }, "detailed");
    for (const id of c.missing) errors[id] ??= "required" as never;
    if (Object.keys(errors).length) throw new FormValidationError(errors);
    const latest = await getLatestSizing(tx, project.id);
    const version = (latest?.version ?? 0) + 1;
    await tx.insert(sizingResults).values({
      projectId: project.id,
      version,
      templateKey: SIZING_RESULT_FORM.key,
      templateVersion: SIZING_RESULT_FORM.version,
      answers: next,
      createdBy: actor.id,
    });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "sizing.record",
      entityType: "sizing_result",
      entityId: `${project.id}:v${version}`,
      projectId: project.id,
      after: { version, answers: next },
    });
    return version;
  });
}

const num = (v: unknown) => (isQuantity(v) ? v.si : typeof v === "number" ? v : undefined);

/** Sizing values exposed to the rule engine (sizing.*). */
export function sizingRuleInputs(answers: Answers | null): Record<string, number | boolean | undefined> {
  if (!answers) return {};
  const icing = answers["inputs.icing_considered"];
  return {
    capacity_after_icing: num(answers["result.capacity_after_icing"]),
    design_ambient_min_temp: num(answers["inputs.design_ambient_min_temp"]),
    icing_considered: typeof icing === "boolean" ? icing : undefined,
  };
}

export interface ProjectAutonomy {
  result: AutonomyResult;
  config: StoredCalcConfig | null;
  params: Record<string, number | undefined>;
  inputs: { tankVolume?: number; qPeak?: number; qAvg?: number; requiredAutonomy?: number };
  sizingVersion: number | null;
}

/** Autonomy of a project from Design Basis, latest sizing (V_tank) and the current calculation config. */
export async function projectAutonomy(db: DbOrTx, project: Project): Promise<ProjectAutonomy> {
  const [basis] = await db.select().from(designBases).where(eq(designBases.projectId, project.id));
  const sizing = await getLatestSizing(db, project.id);
  const config = await getCurrentCalcConfig(db, AUTONOMY_KEY);
  const params = config ? calcParamValues(config.config, project.medium) : {};
  const field = (k: string) => {
    const v = basis?.data.fields[k]?.value;
    return typeof v === "number" ? v : undefined;
  };
  const inputs = {
    tankVolume: num(sizing?.answers["inputs.tank_volume"]),
    qPeak: field("qPeak"),
    qAvg: field("qAvg"),
    requiredAutonomy: field("requiredAutonomy"),
  };
  return { result: computeAutonomy(params, inputs), config, params, inputs, sizingVersion: sizing?.version ?? null };
}
