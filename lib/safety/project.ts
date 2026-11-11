import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx, Tx } from "@/db/client";
import {
  designBases,
  designInputs,
  layoutVersions,
  projects,
  ruleEvaluations,
  ruleOverrides,
  stages,
  type Project,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { assertCan, can, ForbiddenError } from "@/lib/auth/rbac";
import { DESIGN_CHECKLIST_FORM, LAYOUT_GEOMETRY_FORM } from "@/lib/forms";
import { planSchema } from "@/lib/geometry";
import { effectiveGeometry } from "@/lib/geometry/effective";
import type { Answers } from "@/lib/questionnaire/answers";
import { applyRawAnswers } from "@/lib/questionnaire/apply";
import { completeness } from "@/lib/questionnaire/completeness";
import { buildRuleInputs } from "@/lib/rules/inputs";
import { evaluateRule, evaluationFingerprint, type Rule, type RuleEvaluation, type RuleResult } from "@/lib/rules/rule";
import { canEditStage } from "@/lib/workflow/permissions";
import { getTemplate, stageTemplate, type Medium } from "@/lib/workflow/template";
import { FormValidationError, SafetyServiceError, type Actor } from "./errors";
import { listCurrentRules } from "./rules-service";
import { listStandards } from "./standards-service";
import { getLatestSizing, projectAutonomy, sizingRuleInputs } from "@/lib/sizing/service";
import { AUTONOMY_KEY, getCurrentCalcConfig } from "@/lib/calc/config-service";

// ------------------------------------------------------------------ inputs

export async function loadProjectRuleInputs(db: DbOrTx, project: Project) {
  const [basis] = await db.select().from(designBases).where(eq(designBases.projectId, project.id));
  const [layout] = await db
    .select()
    .from(layoutVersions)
    .where(eq(layoutVersions.projectId, project.id))
    .orderBy(desc(layoutVersions.version))
    .limit(1);
  const [design] = await db.select().from(designInputs).where(eq(designInputs.projectId, project.id));
  const sizing = await getLatestSizing(db, project.id);
  const autonomy = await projectAutonomy(db, project);
  const inputs = buildRuleInputs({
    medium: project.medium,
    designBasis: basis?.data ?? null,
    layout: layout ? { form: LAYOUT_GEOMETRY_FORM, answers: effectiveGeometry(layout.geometry as Answers | null, layout.plan).answers } : null,
    design: design ? { form: DESIGN_CHECKLIST_FORM, answers: design.answers } : null,
    sizing: sizingRuleInputs(sizing?.answers ?? null),
    calc: { autonomy: autonomy.result.autonomyPeak ?? undefined },
  });
  return { inputs, layoutVersion: layout?.version ?? null };
}

// ------------------------------------------------------------------ evaluation

export function fingerprintHash(e: Pick<RuleEvaluation, "ruleId" | "ruleVersion" | "inputs" | "params">): string {
  return createHash("sha256").update(evaluationFingerprint(e)).digest("hex");
}

export interface ProjectRuleResult extends RuleEvaluation {
  rule: Rule;
  fingerprint: string;
  /** Active NO-GO override matching this rule version and inputs. */
  override: typeof ruleOverrides.$inferSelect | null;
  /** Active WARNING acknowledgement matching this rule version and inputs. */
  acknowledgement: typeof ruleOverrides.$inferSelect | null;
  /** NO-GO that is not overridden. */
  blocking: boolean;
}

export interface StageRuleStatus {
  noGo: string[];
  notEvaluated: string[];
  /** WARNING results that nobody has acknowledged yet (block the gate, open question 25). */
  unacknowledgedWarnings: string[];
}

export interface ProjectEvaluation {
  project: Project;
  medium: Medium;
  layoutVersion: number | null;
  inputs: Record<string, number | string | boolean>;
  results: ProjectRuleResult[];
  counts: Record<RuleResult, number> & { overridden: number; acknowledged: number; draft: number };
  byStage: Record<string, StageRuleStatus>;
}

export async function evaluateProject(db: DbOrTx, projectId: string): Promise<ProjectEvaluation | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const { inputs, layoutVersion } = await loadProjectRuleInputs(db, project);
  const current = await listCurrentRules(db);
  const overrides = await db
    .select()
    .from(ruleOverrides)
    .where(and(eq(ruleOverrides.projectId, projectId), isNull(ruleOverrides.revokedAt)));

  const results: ProjectRuleResult[] = [];
  for (const { rule } of current) {
    const e = evaluateRule(rule, project.medium, inputs);
    if (!e) continue;
    const fingerprint = fingerprintHash(e);
    const match = (kind: "override" | "acknowledgement") =>
      overrides.find((o) => o.kind === kind && o.ruleId === rule.id && o.ruleVersion === rule.version && o.fingerprint === fingerprint) ?? null;
    const override = e.result === "NO-GO" ? match("override") : null;
    const acknowledgement = e.result === "WARNING" ? match("acknowledgement") : null;
    results.push({ ...e, rule, fingerprint, override, acknowledgement, blocking: e.result === "NO-GO" && !override });
  }

  const counts: ProjectEvaluation["counts"] = { GO: 0, WARNING: 0, "NO-GO": 0, NOT_EVALUATED: 0, overridden: 0, acknowledged: 0, draft: 0 };
  const byStage: ProjectEvaluation["byStage"] = {};
  for (const r of results) {
    if (r.result === "NO-GO" && r.override) counts.overridden += 1;
    else if (r.result === "WARNING" && r.acknowledgement) counts.acknowledged += 1;
    else counts[r.result] += 1;
    if (r.status === "DRAFT") counts.draft += 1;
    for (const s of r.rule.stages) {
      const b = (byStage[s] ??= { noGo: [], notEvaluated: [], unacknowledgedWarnings: [] });
      if (r.blocking) b.noGo.push(r.ruleId);
      if (r.result === "NOT_EVALUATED") b.notEvaluated.push(r.ruleId);
      if (r.result === "WARNING" && !r.acknowledgement) b.unacknowledgedWarnings.push(r.ruleId);
    }
  }
  return { project, medium: project.medium, layoutVersion, inputs, results, counts, byStage };
}

/**
 * Rule status of one step for its gate. Returns null when no applicable rule
 * is mapped to the step: an empty catalogue (e.g. rules not imported) must
 * never let a rule-based gate pass.
 */
export function stageRuleStatus(
  evaluation: Pick<ProjectEvaluation, "results" | "byStage"> | null,
  stageKey: string,
): StageRuleStatus | null {
  if (!evaluation) return null;
  const mapped = evaluation.results.filter((r) => r.rule.stages.includes(stageKey));
  if (mapped.length === 0) return null;
  return evaluation.byStage[stageKey] ?? { noGo: [], notEvaluated: [], unacknowledgedWarnings: [] };
}

/** Rules and standards applicable to the medium that are not VERIFIED (step 5 gate). */
export async function verificationStatus(db: DbOrTx, medium: Medium) {
  const current = await listCurrentRules(db);
  const stds = await listStandards(db);
  const applicable = stds.filter((s) => s.appliesTo.includes(medium));
  const calc = await getCurrentCalcConfig(db, AUTONOMY_KEY);
  return {
    unverifiedCalc: calc && calc.status !== "VERIFIED" ? [`${AUTONOMY_KEY}@${calc.config.version}`] : [],
    unverifiedRules: current.filter((r) => r.rule.appliesTo.includes(medium) && r.status !== "VERIFIED").map((r) => r.rule.id),
    unverifiedStandards: applicable.filter((s) => s.status !== "VERIFIED").map((s) => s.code),
    standardsCount: applicable.length,
  };
}

/** Missing required geometry inputs of the concept (v0) and the latest final (v1+) layout. */
export async function layoutGeometryStatus(db: DbOrTx, projectId: string, medium: Medium) {
  const rows = await db.select().from(layoutVersions).where(eq(layoutVersions.projectId, projectId)).orderBy(desc(layoutVersions.version));
  const missing = (row: (typeof rows)[number]) =>
    completeness(LAYOUT_GEOMETRY_FORM, { medium, answers: effectiveGeometry(row.geometry as Answers | null, row.plan).answers }, "detailed")
      .missing.length;
  const concept = rows.find((r) => r.version === 0);
  const final = rows.find((r) => r.version >= 1);
  return { concept: concept ? missing(concept) : null, final: final ? missing(final) : null };
}

// ------------------------------------------------------------------ inputs editing

const formInputSchema = z.object({ projectId: z.uuid(), answers: z.record(z.string().max(80), z.unknown()) });

async function stageState(tx: DbOrTx, projectId: string, key: string) {
  const [s] = await tx
    .select({ state: stages.state })
    .from(stages)
    .where(and(eq(stages.projectId, projectId), eq(stages.key, key)));
  return s?.state ?? null;
}

/** Design checklist (inputs of P&ID rules). Frozen once step 4 is closed. */
export async function saveDesignInputs(db: Db, actor: Actor, input: unknown): Promise<number> {
  const data = formInputSchema.parse(input);
  if (!can(actor.roles, "design.write")) throw new ForbiddenError("design.write", data.projectId);
  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, data.projectId)).for("update");
    if (!project) throw new SafetyServiceError("NOT_FOUND");
    if ((await stageState(tx, project.id, "4")) === "CLOSED") throw new SafetyServiceError("STAGE_CLOSED");
    const [existing] = await tx.select().from(designInputs).where(eq(designInputs.projectId, project.id));
    const { next, changes, errors } = applyRawAnswers(DESIGN_CHECKLIST_FORM, existing?.answers ?? {}, data.answers);
    if (Object.keys(errors).length) throw new FormValidationError(errors);
    if (!Object.keys(changes).length) return 0;
    const now = new Date();
    await tx
      .insert(designInputs)
      .values({
        projectId: project.id,
        templateKey: DESIGN_CHECKLIST_FORM.key,
        templateVersion: DESIGN_CHECKLIST_FORM.version,
        answers: next,
        updatedAt: now,
        updatedBy: actor.id,
      })
      .onConflictDoUpdate({ target: designInputs.projectId, set: { answers: next, updatedAt: now, updatedBy: actor.id } });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "design.save",
      entityType: "design_inputs",
      entityId: project.id,
      projectId: project.id,
      after: { changes },
    });
    return Object.keys(changes).length;
  });
}

/** Lock project, find the layout version and check that the actor may edit its step (v0 → 3, vN → 9). */
async function editableLayout(tx: Tx, actor: Actor, projectId: string, version: number) {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).for("update");
  if (!project) throw new SafetyServiceError("NOT_FOUND");
  const [layout] = await tx
    .select()
    .from(layoutVersions)
    .where(and(eq(layoutVersions.projectId, project.id), eq(layoutVersions.version, version)));
  if (!layout) throw new SafetyServiceError("NO_LAYOUT_VERSION");
  const tpl = getTemplate(project.templateKey, project.templateVersion);
  const def = tpl.stages.find((s) => s.layout === (version === 0 ? "concept" : "final"));
  if (!def) throw new SafetyServiceError("NO_LAYOUT_VERSION");
  const state = await stageState(tx, project.id, def.key);
  if (state === "CLOSED") throw new SafetyServiceError("STAGE_CLOSED");
  if (!state || !canEditStage(actor.roles, stageTemplate(tpl, def.key), state)) {
    throw new ForbiddenError(`stage.layout:${def.key}`, project.id);
  }
  return { project, layout };
}

/** Geometry of a layout version (v0 → step 3, vN → step 9). Frozen once the step is closed. */
export async function saveLayoutGeometry(db: Db, actor: Actor, input: unknown): Promise<number> {
  const data = formInputSchema.extend({ version: z.coerce.number().int().min(0) }).parse(input);
  return db.transaction(async (tx) => {
    const { project, layout } = await editableLayout(tx, actor, data.projectId, data.version);
    const { next, changes, errors } = applyRawAnswers(LAYOUT_GEOMETRY_FORM, (layout.geometry as Answers | null) ?? {}, data.answers);
    if (Object.keys(errors).length) throw new FormValidationError(errors);
    if (!Object.keys(changes).length) return 0;
    await tx.update(layoutVersions).set({ geometry: next }).where(eq(layoutVersions.id, layout.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "layout.geometry",
      entityType: "layout_version",
      entityId: `${project.id}:v${layout.version}`,
      projectId: project.id,
      after: { version: layout.version, changes },
    });
    return Object.keys(changes).length;
  });
}

/** Plot plan objects of a layout version; distances for the rules are derived from it (phase 6). */
export async function saveLayoutPlan(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = z.object({ projectId: z.uuid(), version: z.coerce.number().int().min(0), plan: planSchema }).parse(input);
  await db.transaction(async (tx) => {
    const { project, layout } = await editableLayout(tx, actor, data.projectId, data.version);
    await tx.update(layoutVersions).set({ plan: data.plan }).where(eq(layoutVersions.id, layout.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "layout.plan",
      entityType: "layout_version",
      entityId: `${project.id}:v${layout.version}`,
      projectId: project.id,
      before: { objects: layout.plan?.objects.length ?? 0 },
      after: { plan: data.plan },
    });
  });
}

// ------------------------------------------------------------------ overrides and snapshots

/** Manual override of a NO-GO by Process Safety with a mandatory reason (SPEC §7.1). */
export async function overrideNoGo(db: Db, actor: Actor, input: unknown): Promise<string> {
  assertCan(actor.roles, "rule.override");
  const data = z
    .object({ projectId: z.uuid(), ruleId: z.string().min(1), reason: z.string().trim().min(10).max(2000) })
    .parse(input);
  return db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, data.projectId)).for("update");
    const evaluation = await evaluateProject(tx, data.projectId);
    if (!evaluation) throw new SafetyServiceError("NOT_FOUND");
    const r = evaluation.results.find((x) => x.ruleId === data.ruleId);
    if (!r) throw new SafetyServiceError("NOT_FOUND");
    if (r.result !== "NO-GO") throw new SafetyServiceError("NOT_NO_GO");
    if (r.override) throw new SafetyServiceError("ALREADY_OVERRIDDEN");
    const [row] = await tx
      .insert(ruleOverrides)
      .values({
        projectId: data.projectId,
        ruleId: r.ruleId,
        ruleVersion: r.ruleVersion,
        fingerprint: r.fingerprint,
        reason: data.reason,
        createdBy: actor.id,
      })
      .returning({ id: ruleOverrides.id });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "rule.override",
      entityType: "rule",
      entityId: `${r.ruleId}@${r.ruleVersion}`,
      projectId: data.projectId,
      after: { result: "NO-GO", inputs: r.inputs, params: r.params, fingerprint: r.fingerprint },
      reason: data.reason,
    });
    return row!.id;
  });
}

/**
 * A person (Process Safety or OAM) reviews a WARNING with a mandatory comment
 * (open question 25). Bound to the rule version and input fingerprint like an
 * override, so it lapses when anything the result depends on changes.
 */
export async function acknowledgeWarning(db: Db, actor: Actor, input: unknown): Promise<string> {
  assertCan(actor.roles, "rule.acknowledge");
  const data = z
    .object({ projectId: z.uuid(), ruleId: z.string().min(1), reason: z.string().trim().min(10).max(2000) })
    .parse(input);
  return db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, data.projectId)).for("update");
    const evaluation = await evaluateProject(tx, data.projectId);
    if (!evaluation) throw new SafetyServiceError("NOT_FOUND");
    const r = evaluation.results.find((x) => x.ruleId === data.ruleId);
    if (!r) throw new SafetyServiceError("NOT_FOUND");
    if (r.result !== "WARNING") throw new SafetyServiceError("NOT_WARNING");
    if (r.acknowledgement) throw new SafetyServiceError("ALREADY_ACKNOWLEDGED");
    const [row] = await tx
      .insert(ruleOverrides)
      .values({
        kind: "acknowledgement",
        projectId: data.projectId,
        ruleId: r.ruleId,
        ruleVersion: r.ruleVersion,
        fingerprint: r.fingerprint,
        reason: data.reason,
        createdBy: actor.id,
      })
      .returning({ id: ruleOverrides.id });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "rule.acknowledge",
      entityType: "rule",
      entityId: `${r.ruleId}@${r.ruleVersion}`,
      projectId: data.projectId,
      after: { result: "WARNING", inputs: r.inputs, params: r.params, fingerprint: r.fingerprint },
      reason: data.reason,
    });
    return row!.id;
  });
}

/** Revoke an override (Process Safety) or a WARNING acknowledgement (Process Safety / OAM). */
export async function revokeOverride(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = z.object({ overrideId: z.uuid(), reason: z.string().trim().min(1).max(2000) }).parse(input);
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(ruleOverrides).where(eq(ruleOverrides.id, data.overrideId)).for("update");
    if (!o || o.revokedAt) throw new SafetyServiceError("NOT_FOUND");
    assertCan(actor.roles, o.kind === "override" ? "rule.override" : "rule.acknowledge");
    await tx
      .update(ruleOverrides)
      .set({ revokedAt: new Date(), revokedBy: actor.id, revokeReason: data.reason })
      .where(eq(ruleOverrides.id, o.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: o.kind === "override" ? "rule.override_revoke" : "rule.acknowledge_revoke",
      entityType: "rule",
      entityId: `${o.ruleId}@${o.ruleVersion}`,
      projectId: o.projectId,
      reason: data.reason,
    });
  });
}

export async function listOverrides(db: DbOrTx, projectId: string) {
  return db.select().from(ruleOverrides).where(eq(ruleOverrides.projectId, projectId)).orderBy(desc(ruleOverrides.createdAt));
}

/** Store a reproducible snapshot of the current evaluation (SPEC §4 RuleEvaluation). */
export async function saveEvaluationSnapshot(db: Db, actor: Actor, input: unknown): Promise<string> {
  assertCan(actor.roles, "safety.snapshot");
  const { projectId } = z.object({ projectId: z.uuid() }).parse(input);
  return db.transaction(async (tx) => {
    const evaluation = await evaluateProject(tx, projectId);
    if (!evaluation) throw new SafetyServiceError("NOT_FOUND");
    const runId = randomUUID();
    if (evaluation.results.length) {
      await tx.insert(ruleEvaluations).values(
        evaluation.results.map((r) => ({
          runId,
          projectId,
          ruleId: r.ruleId,
          ruleVersion: r.ruleVersion,
          ruleStatus: r.status,
          result: r.result,
          overridden: !!r.override,
          inputs: r.inputs,
          params: r.params,
          details: {
            missingInputs: r.missingInputs,
            missingParams: r.missingParams,
            fingerprint: r.fingerprint,
            overrideId: r.override?.id ?? null,
            acknowledgementId: r.acknowledgement?.id ?? null,
          },
          evaluatedBy: actor.id,
        })),
      );
    }
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "safety.snapshot",
      entityType: "rule_evaluation_run",
      entityId: runId,
      projectId,
      after: { counts: evaluation.counts, layoutVersion: evaluation.layoutVersion },
    });
    return runId;
  });
}

export async function listSnapshots(db: DbOrTx, projectId: string) {
  const rows = await db
    .select({ runId: ruleEvaluations.runId, evaluatedAt: ruleEvaluations.evaluatedAt, evaluatedBy: ruleEvaluations.evaluatedBy, result: ruleEvaluations.result })
    .from(ruleEvaluations)
    .where(eq(ruleEvaluations.projectId, projectId))
    .orderBy(desc(ruleEvaluations.evaluatedAt));
  const runs = new Map<string, { runId: string; evaluatedAt: Date; evaluatedBy: string; counts: Record<string, number> }>();
  for (const r of rows) {
    const run = runs.get(r.runId) ?? { runId: r.runId, evaluatedAt: r.evaluatedAt, evaluatedBy: r.evaluatedBy, counts: {} };
    run.counts[r.result] = (run.counts[r.result] ?? 0) + 1;
    runs.set(r.runId, run);
  }
  return [...runs.values()];
}

export async function getDesignInputs(db: DbOrTx, projectId: string) {
  const [row] = await db.select().from(designInputs).where(eq(designInputs.projectId, projectId));
  return row ?? null;
}
