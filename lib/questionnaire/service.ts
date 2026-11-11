import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db/client";
import { designBases, projects, questionnaireResponses, stages } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can, ForbiddenError } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/roles";
import { getTemplate } from "@/lib/workflow/template";
import type { Answers } from "./answers";
import { applyRawAnswers, type ApplyError } from "./apply";
import { completeness, type Completeness } from "./completeness";
import { buildDesignBasis, type DesignBasis } from "./design-basis";
import { DEFAULT_QUESTIONNAIRE, getQuestionnaireTemplate, type QuestionnaireTemplate } from "./template";

export interface Actor {
  id: string;
  roles: readonly Role[];
}

export type QuestionnaireErrorCode = "NOT_FOUND" | "STAGE_CLOSED" | "INITIAL_INCOMPLETE" | "ALREADY_DETAILED";

export class QuestionnaireServiceError extends Error {
  override name = "QuestionnaireServiceError";
  constructor(public readonly code: QuestionnaireErrorCode) {
    super(code);
  }
}

/** Field-level validation errors keyed by question id. */
export class QuestionnaireValidationError extends Error {
  override name = "QuestionnaireValidationError";
  constructor(public readonly errors: Record<string, ApplyError>) {
    super("validation");
  }
}

const saveSchema = z.object({
  projectId: z.uuid(),
  answers: z.record(z.string().max(80), z.unknown()),
});

function requireWrite(actor: Actor, projectId: string): void {
  if (!can(actor.roles, "questionnaire.write")) throw new ForbiddenError("questionnaire.write", projectId);
}

/** The step whose gate checks the questionnaire is frozen once closed. */
async function questionnaireStepClosed(tx: DbOrTx, projectId: string, lock: boolean): Promise<boolean> {
  const q = tx.select().from(projects).where(eq(projects.id, projectId));
  const [project] = lock ? await q.for("update") : await q;
  if (!project) throw new QuestionnaireServiceError("NOT_FOUND");
  const tpl = getTemplate(project.templateKey, project.templateVersion);
  const keys = tpl.stages.filter((s) => s.gate.some((g) => g.type === "questionnaireComplete")).map((s) => s.key);
  for (const key of keys) {
    const [st] = await tx
      .select({ state: stages.state })
      .from(stages)
      .where(and(eq(stages.projectId, projectId), eq(stages.key, key)));
    if (st?.state === "CLOSED") return true;
  }
  return false;
}

async function assertQuestionnaireStepOpen(tx: DbOrTx, projectId: string): Promise<void> {
  if (await questionnaireStepClosed(tx, projectId, true)) throw new QuestionnaireServiceError("STAGE_CLOSED");
}

/**
 * Save (part of) the questionnaire. Partial saves are allowed (draft); only
 * the provided questions change. Empty values clear an answer. The Design
 * Basis is rebuilt on every save.
 */
export async function saveAnswers(db: Db, actor: Actor, input: unknown): Promise<{ changed: number }> {
  const data = saveSchema.parse(input);
  requireWrite(actor, data.projectId);
  return db.transaction(async (tx) => {
    await assertQuestionnaireStepOpen(tx, data.projectId);
    const [project] = await tx.select().from(projects).where(eq(projects.id, data.projectId));
    const [existing] = await tx
      .select()
      .from(questionnaireResponses)
      .where(eq(questionnaireResponses.projectId, data.projectId));
    const tpl = existing ? getQuestionnaireTemplate(existing.templateKey, existing.templateVersion) : DEFAULT_QUESTIONNAIRE;

    const { next, changes, errors } = applyRawAnswers(tpl, existing?.answers ?? {}, data.answers);
    if (Object.keys(errors).length) throw new QuestionnaireValidationError(errors);
    if (!Object.keys(changes).length) return { changed: 0 };

    const now = new Date();
    if (existing) {
      await tx
        .update(questionnaireResponses)
        .set({ answers: next, updatedAt: now, updatedBy: actor.id })
        .where(eq(questionnaireResponses.projectId, data.projectId));
    } else {
      await tx.insert(questionnaireResponses).values({
        projectId: data.projectId,
        templateKey: tpl.key,
        templateVersion: tpl.version,
        answers: next,
        updatedBy: actor.id,
      });
    }
    const designBasis = buildDesignBasis(tpl, project!.medium, next);
    await tx
      .insert(designBases)
      .values({ projectId: data.projectId, data: designBasis, updatedAt: now, updatedBy: actor.id })
      .onConflictDoUpdate({ target: designBases.projectId, set: { data: designBasis, updatedAt: now, updatedBy: actor.id } });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "questionnaire.save",
      entityType: "questionnaire",
      entityId: data.projectId,
      projectId: data.projectId,
      after: { template: `${tpl.key}@${tpl.version}`, changes },
    });
    return { changed: Object.keys(changes).length };
  });
}

/** Move from initial to detailed requirements once the initial part is complete. */
export async function advancePhase(db: Db, actor: Actor, input: unknown): Promise<void> {
  const { projectId } = z.object({ projectId: z.uuid() }).parse(input);
  requireWrite(actor, projectId);
  await db.transaction(async (tx) => {
    await assertQuestionnaireStepOpen(tx, projectId);
    const [row] = await tx
      .select({ r: questionnaireResponses, medium: projects.medium })
      .from(questionnaireResponses)
      .innerJoin(projects, eq(projects.id, questionnaireResponses.projectId))
      .where(eq(questionnaireResponses.projectId, projectId));
    if (!row) throw new QuestionnaireServiceError("INITIAL_INCOMPLETE");
    if (row.r.phase === "DETAILED") throw new QuestionnaireServiceError("ALREADY_DETAILED");
    const tpl = getQuestionnaireTemplate(row.r.templateKey, row.r.templateVersion);
    const c = completeness(tpl, { medium: row.medium, answers: row.r.answers }, "initial");
    if (c.missing.length) throw new QuestionnaireServiceError("INITIAL_INCOMPLETE");
    await tx
      .update(questionnaireResponses)
      .set({ phase: "DETAILED", updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(questionnaireResponses.projectId, projectId));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "questionnaire.phase",
      entityType: "questionnaire",
      entityId: projectId,
      projectId,
      before: { phase: "INITIAL" },
      after: { phase: "DETAILED" },
    });
  });
}

export interface QuestionnaireView {
  project: typeof projects.$inferSelect;
  template: QuestionnaireTemplate;
  phase: "INITIAL" | "DETAILED";
  answers: Answers;
  updatedAt: Date | null;
  updatedBy: string | null;
  initial: Completeness;
  detailed: Completeness;
  designBasis: DesignBasis | null;
  designBasisUpdatedAt: Date | null;
  stepClosed: boolean;
}

export async function getQuestionnaire(db: Db, projectId: string): Promise<QuestionnaireView | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const [r] = await db.select().from(questionnaireResponses).where(eq(questionnaireResponses.projectId, projectId));
  const [db0] = await db.select().from(designBases).where(eq(designBases.projectId, projectId));
  const template = r ? getQuestionnaireTemplate(r.templateKey, r.templateVersion) : DEFAULT_QUESTIONNAIRE;
  const answers = r?.answers ?? {};
  const ctx = { medium: project.medium, answers };
  const stepClosed = await questionnaireStepClosed(db, projectId, false);
  return {
    project,
    template,
    phase: r?.phase ?? "INITIAL",
    answers,
    updatedAt: r?.updatedAt ?? null,
    updatedBy: r?.updatedBy ?? null,
    initial: completeness(template, ctx, "initial"),
    detailed: completeness(template, ctx, "detailed"),
    designBasis: db0?.data ?? null,
    designBasisUpdatedAt: db0?.updatedAt ?? null,
    stepClosed,
  };
}
