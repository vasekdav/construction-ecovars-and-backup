import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  auditLog,
  decisions,
  documentLinks,
  layoutVersions,
  projects,
  roleAssignments,
  stageComments,
  stages,
  tasks,
  users,
} from "@/db/schema";
import type { Role } from "@/lib/auth/roles";
import { unmetDependencies, waitingOn, type WaitingOn } from "./dependencies";
import { evaluateGate, type GateEvaluation } from "./gate";
import { loadGateContext } from "./service";
import { getTemplate, stageTemplate, type ProcessTemplate, type StageTemplate } from "./template";
import type { StageSnapshot } from "./types";

export async function userNames(db: Db, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((v): v is string => !!v))];
  if (!unique.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function listActiveUsers(db: Db): Promise<{ id: string; name: string; roles: Role[] }[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, role: roleAssignments.role })
    .from(users)
    .leftJoin(roleAssignments, eq(roleAssignments.userId, users.id))
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
  const map = new Map<string, { id: string; name: string; roles: Role[] }>();
  for (const r of rows) {
    const u = map.get(r.id) ?? { id: r.id, name: r.name, roles: [] };
    if (r.role) u.roles.push(r.role);
    map.set(r.id, u);
  }
  return [...map.values()];
}

export async function listProjects(db: Db) {
  const rows = await db.select().from(projects).orderBy(desc(projects.createdAt));
  if (!rows.length) return [];
  const stageRows = await db
    .select({ projectId: stages.projectId, key: stages.key, state: stages.state, enabled: stages.enabled, sortOrder: stages.sortOrder })
    .from(stages)
    .where(inArray(stages.projectId, rows.map((p) => p.id)))
    .orderBy(asc(stages.sortOrder));
  const names = await userNames(db, rows.map((p) => p.ownerUserId));
  return rows.map((p) => ({
    ...p,
    ownerName: names.get(p.ownerUserId) ?? "",
    stages: stageRows.filter((s) => s.projectId === p.id && s.enabled),
  }));
}

export interface StageOverview {
  id: string;
  key: string;
  def: StageTemplate;
  state: StageSnapshot["state"];
  enabled: boolean;
  dueDate: string | null;
  ownerUserId: string | null;
  openTasks: number;
  waiting: WaitingOn;
}

export interface Deadline {
  date: string;
  stageKey: string;
  label: string;
  kind: "stage" | "task";
}

export async function getProjectOverview(db: Db, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const tpl = getTemplate(project.templateKey, project.templateVersion);
  const stageRows = await db.select().from(stages).where(eq(stages.projectId, projectId)).orderBy(asc(stages.sortOrder));
  const taskRows = stageRows.length
    ? await db.select().from(tasks).where(inArray(tasks.stageId, stageRows.map((s) => s.id)))
    : [];
  const snapshots: StageSnapshot[] = stageRows.map((s) => ({ key: s.key, state: s.state, enabled: s.enabled }));

  const overview: StageOverview[] = stageRows.map((s) => ({
    id: s.id,
    key: s.key,
    def: stageTemplate(tpl, s.key),
    state: s.state,
    enabled: s.enabled,
    dueDate: s.dueDate,
    ownerUserId: s.ownerUserId,
    openTasks: taskRows.filter((t) => t.stageId === s.id && !t.done).length,
    waiting: waitingOn(tpl, { key: s.key, state: s.state, enabled: s.enabled }, snapshots),
  }));

  const keyOf = new Map(stageRows.map((s) => [s.id, s.key]));
  const deadlines: Deadline[] = [
    ...stageRows
      .filter((s) => s.enabled && s.dueDate && s.state !== "CLOSED")
      .map((s) => ({ date: s.dueDate!, stageKey: s.key, label: stageTemplate(tpl, s.key).title.cs, kind: "stage" as const })),
    ...taskRows
      .filter((t) => t.dueDate && !t.done)
      .map((t) => ({ date: t.dueDate!, stageKey: keyOf.get(t.stageId) ?? "", label: t.title, kind: "task" as const })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const names = await userNames(db, [project.ownerUserId, ...stageRows.map((s) => s.ownerUserId)]);
  return { project, tpl, stages: overview, deadlines, names };
}

export async function getStageDetail(db: Db, projectId: string, key: string) {
  const [row] = await db
    .select()
    .from(stages)
    .innerJoin(projects, eq(projects.id, stages.projectId))
    .where(and(eq(stages.projectId, projectId), eq(stages.key, key)));
  if (!row) return null;
  const { stages: stage, projects: project } = row;
  const tpl: ProcessTemplate = getTemplate(project.templateKey, project.templateVersion);
  const def = stageTemplate(tpl, stage.key);

  const all = await db
    .select({ key: stages.key, state: stages.state, enabled: stages.enabled })
    .from(stages)
    .where(eq(stages.projectId, projectId));
  const ctx = await loadGateContext(db, stage);
  const gate: GateEvaluation = evaluateGate(def.gate, ctx);
  const unmet = unmetDependencies(tpl, stage.key, all);

  const [taskRows, links, comments, decisionRows, layouts, history] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.stageId, stage.id)).orderBy(asc(tasks.createdAt)),
    db.select().from(documentLinks).where(eq(documentLinks.stageId, stage.id)).orderBy(asc(documentLinks.createdAt)),
    db.select().from(stageComments).where(eq(stageComments.stageId, stage.id)).orderBy(asc(stageComments.createdAt)),
    db.select().from(decisions).where(eq(decisions.stageId, stage.id)).orderBy(desc(decisions.decidedAt)),
    def.layout
      ? db.select().from(layoutVersions).where(eq(layoutVersions.projectId, projectId)).orderBy(asc(layoutVersions.version))
      : Promise.resolve([]),
    db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.projectId, projectId),
          or(
            eq(auditLog.entityId, stage.id),
            sql`${auditLog.after}->>'stageId' = ${stage.id}`,
            sql`${auditLog.before}->>'stageId' = ${stage.id}`,
          ),
        ),
      )
      .orderBy(desc(auditLog.id))
      .limit(100),
  ]);

  const names = await userNames(db, [
    project.ownerUserId,
    stage.ownerUserId,
    stage.gatePassedBy,
    ...taskRows.map((t) => t.assigneeUserId),
    ...comments.map((c) => c.authorUserId),
    ...decisionRows.map((d) => d.decidedBy),
    ...history.map((h) => h.actorUserId),
    ...Object.values(stage.manualChecks).map((c) => c.by),
  ]);

  return {
    project,
    tpl,
    def,
    stage,
    gate,
    unmetDependencies: unmet,
    tasks: taskRows,
    links,
    comments,
    decisions: decisionRows,
    layouts,
    history,
    names,
  };
}
