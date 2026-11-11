import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, designBases, roleAssignments, stages, users } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/roles";
import { allQuestions, DEFAULT_QUESTIONNAIRE } from "@/lib/questionnaire/template";
import { isVisible } from "@/lib/questionnaire/completeness";
import {
  advancePhase,
  getQuestionnaire,
  QuestionnaireServiceError,
  QuestionnaireValidationError,
  saveAnswers,
} from "@/lib/questionnaire/service";
import { getStageDetail } from "@/lib/workflow/queries";
import { confirmCheck, createProject, transitionStage, type Actor } from "@/lib/workflow/service";
import { hasDb, setupTestDb, uniqueEmail } from "./db";

/** Raw form values for every required question of a phase (fictitious). */
function rawFor(phase: "initial" | "detailed", medium: "O2" | "N2"): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  const live: Record<string, unknown> = {};
  for (const q of allQuestions(DEFAULT_QUESTIONNAIRE)) {
    if (!q.required || (phase === "initial" && q.phase !== "initial")) continue;
    if (!isVisible(q, { medium, answers: live as never })) continue;
    const v =
      q.type === "quantity"
        ? { input: "10", unit: q.defaultUnit }
        : q.type === "boolean"
          ? "false"
          : q.type === "select"
            ? q.options!.find((o) => o.value !== "none")!.value
            : "demo";
    raw[q.id] = v;
    live[q.id] = v === "false" ? false : v;
  }
  return raw;
}

describe.skipIf(!hasDb)("questionnaire service (Postgres)", () => {
  let db: Db;
  let close: () => Promise<void>;
  let oam: Actor;
  let ops: Actor;

  async function user(role: Role): Promise<Actor> {
    const [u] = await db
      .insert(users)
      .values({ email: uniqueEmail(role.toLowerCase()), name: `Q ${role}`, passwordHash: "x" })
      .returning({ id: users.id });
    await db.insert(roleAssignments).values({ userId: u!.id, role });
    return { id: u!.id, roles: [role] };
  }

  const project = (medium: "O2" | "N2" = "O2") =>
    createProject(db, oam, { name: "Q projekt", customer: "Demo", location: "Demo", medium });

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    oam = await user("OAM");
    ops = await user("OPS");
  });
  afterAll(async () => close?.());

  it("saves a draft, converts to SI and fills the Design Basis", async () => {
    const pid = await project();
    const res = await saveAnswers(db, oam, {
      projectId: pid,
      answers: { "consumption.q_peak": { input: "720", unit: "Nm3/h" }, "site.address": "Demo ulice 1" },
    });
    expect(res.changed).toBe(2);
    const view = await getQuestionnaire(db, pid);
    expect(view?.answers["consumption.q_peak"]).toEqual({ si: 0.2, siUnit: "Nm3/s", input: 720, inputUnit: "Nm3/h" });
    expect(view?.initial.percent).toBeGreaterThan(0);
    expect(view?.initial.percent).toBeLessThan(100);
    expect(view?.designBasis?.fields.qPeak?.value).toBeCloseTo(0.2, 12);
    expect(view?.designBasis?.fields.address).toEqual({ source: "site.address", value: "Demo ulice 1" });

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.projectId, pid), eq(auditLog.action, "questionnaire.save")));
    expect(Object.keys((entry?.after as { changes: object }).changes).sort()).toEqual(["consumption.q_peak", "site.address"]);

    expect((await saveAnswers(db, oam, { projectId: pid, answers: { "site.address": "Demo ulice 1" } })).changed).toBe(0);
    await saveAnswers(db, oam, { projectId: pid, answers: { "site.address": "" } });
    const [dbRow] = await db.select().from(designBases).where(eq(designBases.projectId, pid));
    expect(dbRow?.data.fields.address).toBeUndefined();
  });

  it("rejects invalid values per question and unknown questions", async () => {
    const pid = await project();
    const err = await saveAnswers(db, oam, {
      projectId: pid,
      answers: { "consumption.q_peak": { input: "-5", unit: "Nm3/h" }, "site.latitude": "200", "x.y": "1" },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(QuestionnaireValidationError);
    expect(err.errors).toEqual({ "consumption.q_peak": "negative", "site.latitude": "out_of_range", "x.y": "unknown_question" });
    expect((await getQuestionnaire(db, pid))?.answers).toEqual({});
  });

  it("only OAM may write", async () => {
    const pid = await project();
    await expect(saveAnswers(db, ops, { projectId: pid, answers: { "site.address": "x" } })).rejects.toThrow(ForbiddenError);
    await expect(advancePhase(db, ops, { projectId: pid })).rejects.toThrow(ForbiddenError);
  });

  it("phase moves to DETAILED only when the initial part is complete", async () => {
    const pid = await project();
    await expect(advancePhase(db, oam, { projectId: pid })).rejects.toThrow("INITIAL_INCOMPLETE");
    await saveAnswers(db, oam, { projectId: pid, answers: { "site.address": "x" } });
    await expect(advancePhase(db, oam, { projectId: pid })).rejects.toThrow("INITIAL_INCOMPLETE");
    await saveAnswers(db, oam, { projectId: pid, answers: rawFor("initial", "O2") });
    await advancePhase(db, oam, { projectId: pid });
    expect((await getQuestionnaire(db, pid))?.phase).toBe("DETAILED");
    await expect(advancePhase(db, oam, { projectId: pid })).rejects.toThrow("ALREADY_DETAILED");
  });

  it("step 7 gate passes with a complete detailed questionnaire; closed step freezes it", async () => {
    const pid = await project("N2");
    for (const key of ["1", "2"]) {
      await db.update(stages).set({ state: "CLOSED" }).where(and(eq(stages.projectId, pid), eq(stages.key, key)));
    }
    const [s7] = await db.select().from(stages).where(and(eq(stages.projectId, pid), eq(stages.key, "7")));
    await saveAnswers(db, oam, { projectId: pid, answers: rawFor("initial", "N2") });
    await advancePhase(db, oam, { projectId: pid });
    let detail = await getStageDetail(db, pid, "7");
    expect(detail?.gate.results.find((r) => r.id === "questionnaire_complete")?.failure).toBe("questionnaire_incomplete");

    await saveAnswers(db, oam, { projectId: pid, answers: rawFor("detailed", "N2") });
    const view = await getQuestionnaire(db, pid);
    expect(view?.detailed.percent).toBe(100);
    expect(view?.designBasis?.fields.confinedSpaces).toBeDefined();
    detail = await getStageDetail(db, pid, "7");
    expect(detail?.gate.results.find((r) => r.id === "questionnaire_complete")?.met).toBe(true);

    await confirmCheck(db, oam, { stageId: s7!.id, checkId: "oam_confirmed", confirmed: true });
    await transitionStage(db, oam, { stageId: s7!.id, transition: "start" });
    await transitionStage(db, oam, { stageId: s7!.id, transition: "submit" });
    expect(await transitionStage(db, oam, { stageId: s7!.id, transition: "close" })).toEqual({ ok: true, to: "CLOSED" });

    expect((await getQuestionnaire(db, pid))?.stepClosed).toBe(true);
    const err = await saveAnswers(db, oam, { projectId: pid, answers: { "site.address": "změna" } }).catch((e) => e);
    expect(err).toBeInstanceOf(QuestionnaireServiceError);
    expect(err.code).toBe("STAGE_CLOSED");
  });

  it("returns null / NOT_FOUND for unknown projects", async () => {
    const missing = "11111111-1111-4111-8111-111111111111";
    expect(await getQuestionnaire(db, missing)).toBeNull();
    await expect(saveAnswers(db, oam, { projectId: missing, answers: {} })).rejects.toThrow("NOT_FOUND");
  });
});
