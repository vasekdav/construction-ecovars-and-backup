import { and, eq, sql } from "drizzle-orm";
import type { Db, DbOrTx, Tx } from "@/db/client";
import {
  decisions,
  documentLinks,
  layoutVersions,
  projects,
  roleAssignments,
  stageComments,
  stages,
  tasks,
  users,
  type Project,
  type Stage,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { questionnaireGateStatus } from "@/lib/questionnaire/status";
import { assertCan, ForbiddenError } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/roles";
import { unmetDependencies } from "./dependencies";
import { evaluateGate, type GateContext, type GateEvaluation } from "./gate";
import { canConfirmCheck, canEditStage, canManageStage, canTransition } from "./permissions";
import {
  addCommentSchema,
  addDocumentLinkSchema,
  addLayoutVersionSchema,
  addTaskSchema,
  confirmCheckSchema,
  createProjectSchema,
  recordDecisionSchema,
  removeDocumentLinkSchema,
  setTaskDoneSchema,
  stageEnabledSchema,
  stageSettingsSchema,
  transitionSchema,
} from "./schemas";
import { checkTransition, type TransitionError } from "./state-machine";
import {
  appliesToMedium,
  DEFAULT_TEMPLATE,
  getTemplate,
  stageTemplate,
  type ProcessTemplate,
  type StageTemplate,
} from "./template";
import type { StageState } from "./types";

export interface Actor {
  id: string;
  roles: readonly Role[];
}

export type WorkflowErrorCode =
  | "NOT_FOUND"
  | "OWNER_NOT_OAM"
  | "USER_NOT_FOUND"
  | "STAGE_CLOSED"
  | "STAGE_NOT_OPTIONAL"
  | "STAGE_ALREADY_STARTED"
  | "NOT_APPLICABLE"
  | "UNKNOWN_DOCUMENT_KIND"
  | "UNKNOWN_CHECK"
  | "NO_LAYOUT_STEP"
  | "LAYOUT_EXISTS";

export class WorkflowServiceError extends Error {
  override name = "WorkflowServiceError";
  constructor(public readonly code: WorkflowErrorCode) {
    super(code);
  }
}

interface LoadedStage {
  stage: Stage;
  project: Project;
  tpl: ProcessTemplate;
  def: StageTemplate;
}

async function loadStage(tx: DbOrTx, stageId: string, lock = false): Promise<LoadedStage> {
  const q = tx.select().from(stages).innerJoin(projects, eq(projects.id, stages.projectId)).where(eq(stages.id, stageId));
  const [row] = lock ? await q.for("update", { of: stages }) : await q;
  if (!row) throw new WorkflowServiceError("NOT_FOUND");
  const tpl = getTemplate(row.projects.templateKey, row.projects.templateVersion);
  return { stage: row.stages, project: row.projects, tpl, def: stageTemplate(tpl, row.stages.key) };
}

function requireEditable(actor: Actor, l: LoadedStage, action: string): void {
  if (l.stage.state === "CLOSED") throw new WorkflowServiceError("STAGE_CLOSED");
  if (!canEditStage(actor.roles, l.def, l.stage.state)) {
    throw new ForbiddenError(`stage.${action}:${l.stage.key}`, l.project.id);
  }
}

async function requireActiveUser(tx: DbOrTx, userId: string): Promise<Role[]> {
  const rows = await tx
    .select({ active: users.active, role: roleAssignments.role })
    .from(users)
    .leftJoin(roleAssignments, eq(roleAssignments.userId, users.id))
    .where(eq(users.id, userId));
  if (!rows.length || !rows[0]!.active) throw new WorkflowServiceError("USER_NOT_FOUND");
  return rows.map((r) => r.role).filter((r): r is Role => !!r);
}

/** Gate evidence for one stage. */
export async function loadGateContext(tx: DbOrTx, stage: Stage): Promise<GateContext> {
  const links = await tx
    .select({
      kind: documentLinks.kind,
      url: documentLinks.url,
      version: documentLinks.version,
      documentDate: documentLinks.documentDate,
    })
    .from(documentLinks)
    .where(eq(documentLinks.stageId, stage.id));
  const taskRows = await tx.select({ done: tasks.done }).from(tasks).where(eq(tasks.stageId, stage.id));
  const decisionRows = await tx
    .select({ rationale: decisions.rationale })
    .from(decisions)
    .where(eq(decisions.stageId, stage.id));
  const layouts = await tx
    .select({ version: layoutVersions.version, drawingUrl: layoutVersions.drawingUrl })
    .from(layoutVersions)
    .where(eq(layoutVersions.projectId, stage.projectId));
  return {
    documentLinks: links,
    manualChecks: stage.manualChecks,
    tasks: taskRows,
    decisions: decisionRows,
    layoutVersions: layouts,
    ownerUserId: stage.ownerUserId,
    questionnaire: await questionnaireGateStatus(tx, stage.projectId),
  };
}

// ---------------------------------------------------------------- projects

export async function createProject(db: Db, actor: Actor, input: unknown): Promise<string> {
  assertCan(actor.roles, "project.create");
  const data = createProjectSchema.parse(input);
  const tpl = DEFAULT_TEMPLATE;
  return db.transaction(async (tx) => {
    const ownerUserId = data.ownerUserId ?? actor.id;
    const ownerRoles = await requireActiveUser(tx, ownerUserId);
    if (!ownerRoles.includes("OAM")) throw new WorkflowServiceError("OWNER_NOT_OAM");
    const [project] = await tx
      .insert(projects)
      .values({
        name: data.name,
        customer: data.customer,
        location: data.location,
        medium: data.medium,
        ownerUserId,
        templateKey: tpl.key,
        templateVersion: tpl.version,
      })
      .returning();
    if (!project) throw new Error("insert failed");
    await tx.insert(stages).values(
      tpl.stages.map((s, i) => ({
        projectId: project.id,
        key: s.key,
        sortOrder: i,
        enabled: !s.optional && appliesToMedium(s, data.medium),
      })),
    );
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "project.create",
      entityType: "project",
      entityId: project.id,
      projectId: project.id,
      after: { ...data, ownerUserId, template: `${tpl.key}@${tpl.version}` },
    });
    return project.id;
  });
}

// ---------------------------------------------------------------- stages

export type TransitionOutcome =
  | { ok: true; to: StageState }
  | { ok: false; errors: TransitionError[]; gate?: GateEvaluation };

/**
 * Move a stage through the state machine. Every rejected attempt (in
 * particular closing without a passed gate, SPEC §11.2) is audited.
 */
export async function transitionStage(db: Db, actor: Actor, input: unknown): Promise<TransitionOutcome> {
  const data = transitionSchema.parse(input);
  const res = await db.transaction(async (tx) => {
    const l = await loadStage(tx, data.stageId, true);
    const { stage, project, tpl, def } = l;
    if (!canTransition(actor.roles, def, data.transition)) {
      throw new ForbiddenError(`stage.${data.transition}:${stage.key}`, project.id);
    }
    const all = await tx
      .select({ key: stages.key, state: stages.state, enabled: stages.enabled })
      .from(stages)
      .where(eq(stages.projectId, project.id));
    const unmet = unmetDependencies(tpl, stage.key, all);
    const gate = data.transition === "close" ? evaluateGate(def.gate, await loadGateContext(tx, stage)) : undefined;
    const check = checkTransition({
      transition: data.transition,
      state: stage.state,
      enabled: stage.enabled,
      blockedFrom: stage.blockedFrom,
      unmetDependencies: unmet,
      gate,
      reason: data.reason,
    });
    if (!check.ok) {
      return { l, unmet, outcome: { ok: false, errors: check.errors, gate } as TransitionOutcome };
    }
    const now = new Date();
    const patch: Partial<typeof stages.$inferInsert> = { state: check.to, updatedAt: now };
    if (data.transition === "block") {
      patch.blockedFrom = stage.state;
      patch.blockedReason = data.reason;
    }
    if (data.transition === "unblock") {
      patch.blockedFrom = null;
      patch.blockedReason = null;
    }
    if (data.transition === "close") {
      patch.gatePassedAt = now;
      patch.gatePassedBy = actor.id;
    }
    if (data.transition === "reopen") {
      patch.gatePassedAt = null;
      patch.gatePassedBy = null;
    }
    await tx.update(stages).set(patch).where(eq(stages.id, stage.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: data.transition === "close" ? "stage.close" : "stage.transition",
      entityType: "stage",
      entityId: stage.id,
      projectId: project.id,
      before: { stageId: stage.id, stageKey: stage.key, state: stage.state },
      after: {
        stageId: stage.id,
        stageKey: stage.key,
        state: check.to,
        transition: data.transition,
        ...(gate ? { gate: gate.results } : {}),
      },
      reason: data.reason,
    });
    return { l, unmet, outcome: { ok: true, to: check.to } as TransitionOutcome };
  });

  if (!res.outcome.ok) {
    // Outside the transaction so the record survives the rejection.
    await writeAudit(db, {
      actorUserId: actor.id,
      action: data.transition === "close" ? "stage.close_rejected" : "stage.transition_rejected",
      entityType: "stage",
      entityId: res.l.stage.id,
      projectId: res.l.project.id,
      after: {
        stageId: res.l.stage.id,
        stageKey: res.l.stage.key,
        state: res.l.stage.state,
        transition: data.transition,
        errors: res.outcome.errors,
        unmetDependencies: res.unmet,
        unmetGate: res.outcome.gate?.results.filter((r) => !r.met).map((r) => r.id) ?? [],
      },
      reason: data.reason,
    });
  }
  return res.outcome;
}

export async function setStageEnabled(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = stageEnabledSchema.parse(input);
  await db.transaction(async (tx) => {
    const { stage, project, def } = await loadStage(tx, data.stageId, true);
    if (!canManageStage(actor.roles)) throw new ForbiddenError(`stage.enable:${stage.key}`, project.id);
    if (!def.optional) throw new WorkflowServiceError("STAGE_NOT_OPTIONAL");
    if (data.enabled && !appliesToMedium(def, project.medium)) throw new WorkflowServiceError("NOT_APPLICABLE");
    if (stage.state !== "NOT_STARTED") throw new WorkflowServiceError("STAGE_ALREADY_STARTED");
    if (stage.enabled === data.enabled) return;
    await tx.update(stages).set({ enabled: data.enabled, updatedAt: new Date() }).where(eq(stages.id, stage.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "stage.enable",
      entityType: "stage",
      entityId: stage.id,
      projectId: project.id,
      before: { stageId: stage.id, stageKey: stage.key, enabled: stage.enabled },
      after: { stageId: stage.id, stageKey: stage.key, enabled: data.enabled },
    });
  });
}

export async function updateStageSettings(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = stageSettingsSchema.parse(input);
  await db.transaction(async (tx) => {
    const { stage, project } = await loadStage(tx, data.stageId, true);
    if (!canManageStage(actor.roles)) throw new ForbiddenError(`stage.settings:${stage.key}`, project.id);
    if (stage.state === "CLOSED") throw new WorkflowServiceError("STAGE_CLOSED");
    if (data.ownerUserId) await requireActiveUser(tx, data.ownerUserId);
    if (stage.dueDate === data.dueDate && stage.ownerUserId === data.ownerUserId) return;
    await tx
      .update(stages)
      .set({ dueDate: data.dueDate, ownerUserId: data.ownerUserId, updatedAt: new Date() })
      .where(eq(stages.id, stage.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "stage.settings",
      entityType: "stage",
      entityId: stage.id,
      projectId: project.id,
      before: { stageId: stage.id, dueDate: stage.dueDate, ownerUserId: stage.ownerUserId },
      after: { stageId: stage.id, dueDate: data.dueDate, ownerUserId: data.ownerUserId },
    });
  });
}

export async function confirmCheck(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = confirmCheckSchema.parse(input);
  await db.transaction(async (tx) => {
    const { stage, project, def } = await loadStage(tx, data.stageId, true);
    const check = def.gate.find((g) => g.id === data.checkId);
    if (!check || check.type !== "manualCheck") throw new WorkflowServiceError("UNKNOWN_CHECK");
    if (stage.state === "CLOSED") throw new WorkflowServiceError("STAGE_CLOSED");
    if (!canConfirmCheck(actor.roles, check, stage.state)) {
      throw new ForbiddenError(`stage.check:${stage.key}:${check.id}`, project.id);
    }
    const current = stage.manualChecks[check.id];
    if (!!current === data.confirmed) return;
    const next = { ...stage.manualChecks };
    if (data.confirmed) next[check.id] = { by: actor.id, at: new Date().toISOString() };
    else delete next[check.id];
    await tx.update(stages).set({ manualChecks: next, updatedAt: new Date() }).where(eq(stages.id, stage.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: data.confirmed ? "gate.check_confirm" : "gate.check_revoke",
      entityType: "stage",
      entityId: stage.id,
      projectId: project.id,
      after: { stageId: stage.id, stageKey: stage.key, checkId: check.id },
    });
  });
}

// ---------------------------------------------------------------- tasks

export async function addTask(db: Db, actor: Actor, input: unknown): Promise<string> {
  const data = addTaskSchema.parse(input);
  return db.transaction(async (tx) => {
    const l = await loadStage(tx, data.stageId, true);
    requireEditable(actor, l, "task");
    if (data.assigneeUserId) await requireActiveUser(tx, data.assigneeUserId);
    const [task] = await tx
      .insert(tasks)
      .values({ ...data, createdBy: actor.id })
      .returning({ id: tasks.id });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "task.create",
      entityType: "task",
      entityId: task!.id,
      projectId: l.project.id,
      after: { ...data, stageKey: l.stage.key },
    });
    return task!.id;
  });
}

export async function setTaskDone(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = setTaskDoneSchema.parse(input);
  await db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, data.taskId)).for("update");
    if (!task) throw new WorkflowServiceError("NOT_FOUND");
    const l = await loadStage(tx, task.stageId, true);
    requireEditable(actor, l, "task");
    if (task.done === data.done) return;
    await tx
      .update(tasks)
      .set({ done: data.done, doneAt: data.done ? new Date() : null })
      .where(eq(tasks.id, task.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: data.done ? "task.done" : "task.reopen",
      entityType: "task",
      entityId: task.id,
      projectId: l.project.id,
      after: { stageId: l.stage.id, stageKey: l.stage.key, title: task.title, done: data.done },
    });
  });
}

// ---------------------------------------------------------------- document links

export async function addDocumentLink(db: Db, actor: Actor, input: unknown): Promise<string> {
  const data = addDocumentLinkSchema.parse(input);
  return db.transaction(async (tx) => {
    const l = await loadStage(tx, data.stageId, true);
    requireEditable(actor, l, "document");
    if (!l.tpl.documentKinds.some((k) => k.key === data.kind)) throw new WorkflowServiceError("UNKNOWN_DOCUMENT_KIND");
    const [link] = await tx
      .insert(documentLinks)
      .values({ ...data, projectId: l.project.id, createdBy: actor.id })
      .returning({ id: documentLinks.id });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "document.link",
      entityType: "document_link",
      entityId: link!.id,
      projectId: l.project.id,
      after: { ...data, stageKey: l.stage.key },
    });
    return link!.id;
  });
}

export async function removeDocumentLink(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = removeDocumentLinkSchema.parse(input);
  await db.transaction(async (tx) => {
    const [link] = await tx.select().from(documentLinks).where(eq(documentLinks.id, data.linkId)).for("update");
    if (!link || !link.stageId) throw new WorkflowServiceError("NOT_FOUND");
    const l = await loadStage(tx, link.stageId, true);
    requireEditable(actor, l, "document");
    await tx.delete(documentLinks).where(eq(documentLinks.id, link.id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "document.unlink",
      entityType: "document_link",
      entityId: link.id,
      projectId: l.project.id,
      before: {
        stageId: l.stage.id,
        stageKey: l.stage.key,
        kind: link.kind,
        title: link.title,
        url: link.url,
        version: link.version,
        documentDate: link.documentDate,
      },
    });
  });
}

// ---------------------------------------------------------------- comments, decisions, layout

export async function addComment(db: Db, actor: Actor, input: unknown): Promise<string> {
  assertCan(actor.roles, "project.read");
  const data = addCommentSchema.parse(input);
  const { stage } = await loadStage(db, data.stageId);
  const [c] = await db
    .insert(stageComments)
    .values({ stageId: stage.id, authorUserId: actor.id, body: data.body })
    .returning({ id: stageComments.id });
  return c!.id;
}

export async function recordDecision(db: Db, actor: Actor, input: unknown): Promise<string> {
  const data = recordDecisionSchema.parse(input);
  return db.transaction(async (tx) => {
    const l = await loadStage(tx, data.stageId, true);
    requireEditable(actor, l, "decision");
    const [d] = await tx
      .insert(decisions)
      .values({ ...data, projectId: l.project.id, decidedBy: actor.id })
      .returning({ id: decisions.id });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "decision.record",
      entityType: "decision",
      entityId: d!.id,
      projectId: l.project.id,
      after: { ...data, stageKey: l.stage.key },
    });
    return d!.id;
  });
}

export async function addLayoutVersion(db: Db, actor: Actor, input: unknown): Promise<number> {
  const data = addLayoutVersionSchema.parse(input);
  return db.transaction(async (tx: Tx) => {
    const l = await loadStage(tx, data.stageId, true);
    if (!l.def.layout) throw new WorkflowServiceError("NO_LAYOUT_STEP");
    requireEditable(actor, l, "layout");
    // Serialise version numbering per project.
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, l.project.id)).for("update");
    const [{ maxVersion } = { maxVersion: null }] = await tx
      .select({ maxVersion: sql<number | null>`max(${layoutVersions.version})` })
      .from(layoutVersions)
      .where(eq(layoutVersions.projectId, l.project.id));
    let version: number;
    if (l.def.layout === "concept") {
      const [existing] = await tx
        .select({ id: layoutVersions.id })
        .from(layoutVersions)
        .where(and(eq(layoutVersions.projectId, l.project.id), eq(layoutVersions.version, 0)));
      if (existing) throw new WorkflowServiceError("LAYOUT_EXISTS");
      version = 0;
    } else {
      version = Math.max(maxVersion ?? 0, 0) + 1;
    }
    await tx.insert(layoutVersions).values({
      projectId: l.project.id,
      version,
      label: data.label,
      drawingUrl: data.drawingUrl,
      createdBy: actor.id,
    });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "layout.version",
      entityType: "layout_version",
      entityId: `${l.project.id}:v${version}`,
      projectId: l.project.id,
      after: { ...data, stageKey: l.stage.key, version },
    });
    return version;
  });
}
