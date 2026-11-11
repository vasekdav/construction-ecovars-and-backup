import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, roleAssignments, stages, users } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/roles";
import { getProjectOverview, getStageDetail, listActiveUsers, listProjects } from "@/lib/workflow/queries";
import {
  addComment,
  addDocumentLink,
  addLayoutVersion,
  addTask,
  confirmCheck,
  createProject,
  recordDecision,
  removeDocumentLink,
  setStageEnabled,
  setTaskDone,
  transitionStage,
  updateStageSettings,
  WorkflowServiceError,
  type Actor,
} from "@/lib/workflow/service";
import { hasDb, setupTestDb, uniqueEmail } from "./db";

describe.skipIf(!hasDb)("workflow service (Postgres)", () => {
  let db: Db;
  let close: () => Promise<void>;
  const actors: Partial<Record<Role, Actor>> = {};
  const as = (r: Role) => actors[r]!;

  async function makeUser(role: Role): Promise<Actor> {
    const [u] = await db
      .insert(users)
      .values({ email: uniqueEmail(role.toLowerCase()), name: `Test ${role}`, passwordHash: "x" })
      .returning({ id: users.id });
    await db.insert(roleAssignments).values({ userId: u!.id, role });
    return { id: u!.id, roles: [role] };
  }

  async function stageId(projectId: string, key: string): Promise<string> {
    const [s] = await db
      .select({ id: stages.id })
      .from(stages)
      .where(and(eq(stages.projectId, projectId), eq(stages.key, key)));
    return s!.id;
  }

  async function newProject(medium: "O2" | "N2" = "O2") {
    return createProject(db, as("OAM"), { name: "Demo projekt", customer: "Demo Zákazník", location: "Demo", medium });
  }

  /** Close a stage for test setup by satisfying its gate the official way. */
  async function forceClose(projectId: string, key: string) {
    const id = await stageId(projectId, key);
    await db.update(stages).set({ state: "CLOSED" }).where(eq(stages.id, id));
  }

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    for (const r of ["OAM", "OPS", "ROC", "PROCESS_SAFETY", "SIZING", "INVESTMENT", "ADMIN"] as Role[]) {
      actors[r] = await makeUser(r);
    }
  });

  afterAll(async () => {
    await close?.();
  });

  it("creates a project with steps 1–10 enabled and optional steps disabled", async () => {
    const id = await newProject();
    const rows = await db.select().from(stages).where(eq(stages.projectId, id));
    const enabled = rows.filter((s) => s.enabled).map((s) => s.key);
    expect(enabled.sort()).toEqual(["1", "10", "2", "3", "4", "5", "6", "7", "8", "9"].sort());
    expect(rows.filter((s) => !s.enabled).map((s) => s.key).sort()).toEqual(["C1", "F1", "H1", "O1", "P1"]);
    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.projectId, id), eq(auditLog.action, "project.create")));
    expect(entry?.actorUserId).toBe(as("OAM").id);
  });

  it("requires project.create and an OAM owner", async () => {
    await expect(
      createProject(db, as("OPS"), { name: "x", customer: "x", location: "x", medium: "N2" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      createProject(db, as("ADMIN"), { name: "x", customer: "x", location: "x", medium: "N2" }),
    ).rejects.toThrow("OWNER_NOT_OAM");
    const id = await createProject(db, as("ADMIN"), {
      name: "x",
      customer: "x",
      location: "x",
      medium: "N2",
      ownerUserId: as("OAM").id,
    });
    expect(id).toBeTruthy();
  });

  it("cannot close a step without a passed gate; the attempt is audited (SPEC §11.2)", async () => {
    const pid = await newProject();
    const s1 = await stageId(pid, "1");
    expect(await transitionStage(db, as("OAM"), { stageId: s1, transition: "start" })).toEqual({ ok: true, to: "IN_PROGRESS" });
    expect(await transitionStage(db, as("OAM"), { stageId: s1, transition: "submit" })).toEqual({ ok: true, to: "IN_REVIEW" });

    const rejected = await transitionStage(db, as("OAM"), { stageId: s1, transition: "close" });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors).toEqual(["gate_not_passed"]);
    const [attempt] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, s1), eq(auditLog.action, "stage.close_rejected")));
    expect(attempt?.after).toMatchObject({ unmetGate: ["sharepoint_link", "permissions_match_roles"] });

    await addDocumentLink(db, as("OAM"), {
      stageId: s1,
      kind: "sharepoint_site",
      title: "Projektový site",
      url: "https://demo.sharepoint.com/sites/demo",
    });
    await confirmCheck(db, as("OAM"), { stageId: s1, checkId: "permissions_match_roles", confirmed: true });
    expect(await transitionStage(db, as("OAM"), { stageId: s1, transition: "close" })).toEqual({ ok: true, to: "CLOSED" });

    const [closed] = await db.select().from(stages).where(eq(stages.id, s1));
    expect(closed?.gatePassedBy).toBe(as("OAM").id);
    const [closeEntry] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, s1), eq(auditLog.action, "stage.close")));
    expect((closeEntry?.after as { gate: unknown[] }).gate).toHaveLength(2);
  });

  it("closed steps are frozen until reopened with a reason", async () => {
    const pid = await newProject();
    const s1 = await stageId(pid, "1");
    await forceClose(pid, "1");
    await expect(
      addDocumentLink(db, as("OAM"), { stageId: s1, kind: "sharepoint_site", title: "x", url: "https://a.sharepoint.com" }),
    ).rejects.toThrow("STAGE_CLOSED");
    await expect(confirmCheck(db, as("OAM"), { stageId: s1, checkId: "permissions_match_roles", confirmed: true })).rejects.toThrow(
      "STAGE_CLOSED",
    );
    const noReason = await transitionStage(db, as("OAM"), { stageId: s1, transition: "reopen" });
    expect(noReason).toEqual({ ok: false, errors: ["reason_required"], gate: undefined });
    expect(await transitionStage(db, as("OAM"), { stageId: s1, transition: "reopen", reason: "Změna oprávnění" })).toEqual({
      ok: true,
      to: "IN_PROGRESS",
    });
  });

  it("enforces dependencies and stage-level roles", async () => {
    const pid = await newProject();
    const s4 = await stageId(pid, "4");
    expect(await transitionStage(db, as("ROC"), { stageId: s4, transition: "start" })).toMatchObject({
      ok: false,
      errors: ["dependencies_open"],
    });
    await forceClose(pid, "1");
    await forceClose(pid, "2");
    await expect(transitionStage(db, as("OPS"), { stageId: s4, transition: "start" })).rejects.toThrow(ForbiddenError);
    expect(await transitionStage(db, as("ROC"), { stageId: s4, transition: "start" })).toEqual({ ok: true, to: "IN_PROGRESS" });
    expect(await transitionStage(db, as("ROC"), { stageId: s4, transition: "submit" })).toEqual({ ok: true, to: "IN_REVIEW" });
    await expect(transitionStage(db, as("ROC"), { stageId: s4, transition: "close" })).rejects.toThrow(ForbiddenError);
  });

  it("step 4: P&ID comments as tasks, DWG link and ROC confirmation", async () => {
    const pid = await newProject();
    await forceClose(pid, "1");
    await forceClose(pid, "2");
    const s4 = await stageId(pid, "4");
    const taskId = await addTask(db, as("ROC"), { stageId: s4, title: "Doplnit PSV na výstupu", dueDate: "2026-12-01" });
    await addDocumentLink(db, as("ROC"), {
      stageId: s4,
      kind: "pid_dwg",
      title: "P&ID DWG",
      url: "https://demo.sharepoint.com/pid.dwg",
      version: "B",
      documentDate: "2026-11-01",
    });
    await expect(confirmCheck(db, as("OAM"), { stageId: s4, checkId: "roc_confirmed", confirmed: true })).rejects.toThrow(
      ForbiddenError,
    );
    await confirmCheck(db, as("ROC"), { stageId: s4, checkId: "roc_confirmed", confirmed: true });
    await transitionStage(db, as("ROC"), { stageId: s4, transition: "start" });
    await transitionStage(db, as("ROC"), { stageId: s4, transition: "submit" });

    const blocked = await transitionStage(db, as("OAM"), { stageId: s4, transition: "close" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.gate?.results.find((r) => !r.met)).toMatchObject({ id: "comments_closed", details: ["1"] });

    await setTaskDone(db, as("ROC"), { taskId, done: true });
    expect(await transitionStage(db, as("OAM"), { stageId: s4, transition: "close" })).toEqual({ ok: true, to: "CLOSED" });
    await expect(setTaskDone(db, as("ROC"), { taskId, done: false })).rejects.toThrow("STAGE_CLOSED");
  });

  it("phase-gated conditions keep steps 5, 7 and 8 from closing", async () => {
    const pid = await newProject();
    await forceClose(pid, "1");
    await forceClose(pid, "2");
    const s7 = await stageId(pid, "7");
    await confirmCheck(db, as("OAM"), { stageId: s7, checkId: "oam_confirmed", confirmed: true });
    await transitionStage(db, as("OAM"), { stageId: s7, transition: "start" });
    await transitionStage(db, as("OAM"), { stageId: s7, transition: "submit" });
    const res = await transitionStage(db, as("OAM"), { stageId: s7, transition: "close" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.gate?.results.find((r) => r.id === "questionnaire_complete")?.failure).toBe("pending_feature");
  });

  it("block and unblock return to the previous state", async () => {
    const pid = await newProject();
    const s1 = await stageId(pid, "1");
    await transitionStage(db, as("OAM"), { stageId: s1, transition: "start" });
    expect(await transitionStage(db, as("OAM"), { stageId: s1, transition: "block", reason: "Čekáme na IT" })).toEqual({
      ok: true,
      to: "BLOCKED",
    });
    const [blocked] = await db.select().from(stages).where(eq(stages.id, s1));
    expect(blocked).toMatchObject({ blockedFrom: "IN_PROGRESS", blockedReason: "Čekáme na IT" });
    expect(await transitionStage(db, as("OAM"), { stageId: s1, transition: "unblock" })).toEqual({ ok: true, to: "IN_PROGRESS" });
  });

  it("optional steps: enable/disable by OAM, medium filter, only before start", async () => {
    const pid = await newProject("N2");
    const h1 = await stageId(pid, "H1");
    const c1 = await stageId(pid, "C1");
    const s1 = await stageId(pid, "1");
    await expect(setStageEnabled(db, as("OPS"), { stageId: h1, enabled: true })).rejects.toThrow(ForbiddenError);
    await expect(setStageEnabled(db, as("OAM"), { stageId: s1, enabled: false })).rejects.toThrow("STAGE_NOT_OPTIONAL");
    await expect(setStageEnabled(db, as("OAM"), { stageId: c1, enabled: true })).rejects.toThrow("NOT_APPLICABLE");
    await setStageEnabled(db, as("OAM"), { stageId: h1, enabled: true });
    await setStageEnabled(db, as("OAM"), { stageId: h1, enabled: true });
    const [row] = await db.select().from(stages).where(eq(stages.id, h1));
    expect(row?.enabled).toBe(true);
    const entries = await db.select().from(auditLog).where(and(eq(auditLog.entityId, h1), eq(auditLog.action, "stage.enable")));
    expect(entries).toHaveLength(1);
    await db.update(stages).set({ state: "IN_PROGRESS" }).where(eq(stages.id, h1));
    await expect(setStageEnabled(db, as("OAM"), { stageId: h1, enabled: false })).rejects.toThrow("STAGE_ALREADY_STARTED");
  });

  it("step 6: settings (owner, due date) feed the ownerAssigned gate", async () => {
    const pid = await newProject();
    const s6 = await stageId(pid, "6");
    await expect(
      updateStageSettings(db, as("INVESTMENT"), { stageId: s6, ownerUserId: as("INVESTMENT").id }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      updateStageSettings(db, as("OAM"), { stageId: s6, ownerUserId: "11111111-1111-4111-8111-111111111111" }),
    ).rejects.toThrow("USER_NOT_FOUND");
    await updateStageSettings(db, as("OAM"), { stageId: s6, ownerUserId: as("INVESTMENT").id, dueDate: "2027-01-15" });
    const detail = await getStageDetail(db, pid, "6");
    expect(detail?.gate.results.find((r) => r.id === "maintenance_owner")?.met).toBe(true);
    const overview = await getProjectOverview(db, pid);
    expect(overview?.deadlines[0]).toMatchObject({ date: "2027-01-15", stageKey: "6", kind: "stage" });
  });

  it("layout versions: step 3 creates v0 once, step 9 creates v1..vN", async () => {
    const pid = await newProject();
    const s3 = await stageId(pid, "3");
    const s9 = await stageId(pid, "9");
    const s1 = await stageId(pid, "1");
    await expect(addLayoutVersion(db, as("OPS"), { stageId: s1, label: "x" })).rejects.toThrow("NO_LAYOUT_STEP");
    expect(await addLayoutVersion(db, as("OPS"), { stageId: s3, label: "Koncept", drawingUrl: "https://demo.sharepoint.com/v0" })).toBe(0);
    await expect(addLayoutVersion(db, as("OPS"), { stageId: s3, label: "Koncept 2" })).rejects.toThrow("LAYOUT_EXISTS");
    expect(await addLayoutVersion(db, as("OPS"), { stageId: s9, label: "Optimalizace 1" })).toBe(1);
    expect(await addLayoutVersion(db, as("OPS"), { stageId: s9, label: "Optimalizace 2" })).toBe(2);
    const d9 = await getStageDetail(db, pid, "9");
    expect(d9?.layouts.map((l) => l.version)).toEqual([0, 1, 2]);
    expect(d9?.gate.results.find((r) => r.id === "layout_final")).toMatchObject({ met: false, failure: "no_drawing" });
  });

  it("step 10: a recorded decision with rationale passes the gate", async () => {
    const pid = await newProject();
    const s10 = await stageId(pid, "10");
    await recordDecision(db, as("OAM"), {
      stageId: s10,
      subject: "Economizer",
      outcome: "DEFERRED",
      rationale: "Rozhodne se po roce provozu podle trendu spotřeby.",
    });
    const d = await getStageDetail(db, pid, "10");
    expect(d?.gate.passed).toBe(true);
    expect(d?.unmetDependencies).toEqual(["6"]);
  });

  it("document links: https only, known kinds, removal audited", async () => {
    const pid = await newProject();
    const s2 = await stageId(pid, "2");
    await expect(
      addDocumentLink(db, as("OAM"), { stageId: s2, kind: "pid_ces_standard", title: "x", url: "http://insecure.example" }),
    ).rejects.toThrow();
    await expect(
      addDocumentLink(db, as("OAM"), { stageId: s2, kind: "nope", title: "x", url: "https://demo.sharepoint.com" }),
    ).rejects.toThrow("UNKNOWN_DOCUMENT_KIND");
    await expect(
      addDocumentLink(db, as("OPS"), { stageId: s2, kind: "pid_ces_standard", title: "x", url: "https://demo.sharepoint.com" }),
    ).rejects.toThrow(ForbiddenError);
    const id = await addDocumentLink(db, as("OAM"), {
      stageId: s2,
      kind: "pid_ces_standard",
      title: "CES",
      url: "https://demo.sharepoint.com/ces",
      version: "",
      documentDate: "",
    });
    await removeDocumentLink(db, as("OAM"), { linkId: id });
    await expect(removeDocumentLink(db, as("OAM"), { linkId: id })).rejects.toThrow("NOT_FOUND");
    const history = (await getStageDetail(db, pid, "2"))!.history.map((h) => h.action);
    expect(history).toEqual(["document.unlink", "document.link"]);
  });

  it("anyone with project access may comment; overview and lists work", async () => {
    const pid = await newProject();
    const s9 = await stageId(pid, "9");
    await addComment(db, as("OPS"), { stageId: s9, body: "Armatura V-12 je za zdí, nedostupná." });
    const d = await getStageDetail(db, pid, "9");
    expect(d?.comments).toHaveLength(1);
    expect(d?.names.get(as("OPS").id)).toBe("Test OPS");

    const overview = await getProjectOverview(db, pid);
    expect(overview?.stages.find((s) => s.key === "1")?.waiting).toEqual({ kind: "owner", roles: ["OAM"] });
    expect(overview?.stages.find((s) => s.key === "8")?.waiting).toEqual({ kind: "dependencies", stageKeys: ["4", "5", "7"] });
    expect(await getProjectOverview(db, "11111111-1111-4111-8111-111111111111")).toBeNull();
    expect(await getStageDetail(db, pid, "99")).toBeNull();

    const list = await listProjects(db);
    expect(list.find((p) => p.id === pid)?.stages).toHaveLength(10);
    expect((await listActiveUsers(db)).length).toBeGreaterThan(0);
  });

  it("unknown entities raise NOT_FOUND / UNKNOWN_CHECK", async () => {
    const missing = "11111111-1111-4111-8111-111111111111";
    await expect(transitionStage(db, as("OAM"), { stageId: missing, transition: "start" })).rejects.toThrow(WorkflowServiceError);
    await expect(setTaskDone(db, as("OAM"), { taskId: missing, done: true })).rejects.toThrow("NOT_FOUND");
    const pid = await newProject();
    const s1 = await stageId(pid, "1");
    await expect(confirmCheck(db, as("OAM"), { stageId: s1, checkId: "sharepoint_link", confirmed: true })).rejects.toThrow(
      "UNKNOWN_CHECK",
    );
  });
});
