import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import standardsJson from "@/data/standards/candidates.json";
import type { Db } from "@/db/client";
import { auditLog, roleAssignments, ruleEvaluations, stages, users } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/roles";
import { loadRuleFiles } from "@/lib/rules/catalog";
import { SafetyServiceError } from "@/lib/safety/errors";
import {
  evaluateProject,
  layoutGeometryStatus,
  listOverrides,
  listSnapshots,
  overrideNoGo,
  revokeOverride,
  saveDesignInputs,
  saveEvaluationSnapshot,
  saveLayoutGeometry,
  verificationStatus,
} from "@/lib/safety/project";
import { getRuleHistory, listCurrentRules, syncRules, updateRule, verifyRule } from "@/lib/safety/rules-service";
import { listStandards, syncStandards, updateStandard, verifyStandard, type StandardCandidate } from "@/lib/safety/standards-service";
import { saveAnswers } from "@/lib/questionnaire/service";
import { getStageDetail } from "@/lib/workflow/queries";
import { addLayoutVersion, createProject, type Actor } from "@/lib/workflow/service";
import { hasDb, setupTestDb, uniqueEmail } from "./db";

describe.skipIf(!hasDb)("rule engine + safety review (Postgres)", () => {
  let db: Db;
  let close: () => Promise<void>;
  const actors: Partial<Record<Role, Actor>> = {};
  const as = (r: Role) => actors[r]!;

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    for (const role of ["OAM", "OPS", "ROC", "PROCESS_SAFETY", "ADMIN"] as Role[]) {
      const [u] = await db
        .insert(users)
        .values({ email: uniqueEmail(role.toLowerCase()), name: `S ${role}`, passwordHash: "x" })
        .returning({ id: users.id });
      await db.insert(roleAssignments).values({ userId: u!.id, role });
      actors[role] = { id: u!.id, roles: [role] };
    }
    await syncRules(db, loadRuleFiles());
    await syncStandards(db, standardsJson.standards as StandardCandidate[]);
  });
  afterAll(async () => close?.());

  const project = (medium: "O2" | "N2" = "O2") =>
    createProject(db, as("OAM"), { name: "Safety projekt", customer: "Demo", location: "Demo", medium });

  it("imports the 21 starter rules once (idempotent) and the standard candidates", async () => {
    expect(await syncRules(db, loadRuleFiles())).toBe(0);
    const current = await listCurrentRules(db);
    expect(current.map((r) => r.rule.id)).toHaveLength(21);
    expect((await listStandards(db)).length).toBe(standardsJson.standards.length);
  });

  it("a new project: every applicable rule is NEVYHODNOCENO, never GO (SPEC §11.4)", async () => {
    const pid = await project("N2");
    const e = (await evaluateProject(db, pid))!;
    expect(e.results.length).toBe(18); // 21 minus 3 O₂-only rules
    expect(e.results.every((r) => r.result === "NOT_EVALUATED")).toBe(true);
    expect(e.counts.NOT_EVALUATED).toBe(18);
  });

  it("design checklist drives P&ID rules and the step 4 gate; NO-GO override is bound to inputs", async () => {
    const pid = await project("O2");
    await expect(
      saveDesignInputs(db, { ...as("ADMIN") }, { projectId: pid, answers: { "control.check_valve_at_tie_in": "true" } }),
    ).rejects.toThrow(ForbiddenError);
    await saveDesignInputs(db, as("ROC"), { projectId: pid, answers: { "control.check_valve_at_tie_in": "false" } });
    let e = (await evaluateProject(db, pid))!;
    const ctl = () => e.results.find((r) => r.ruleId === "R-CTL-01")!;
    expect(ctl()).toMatchObject({ result: "NO-GO", blocking: true, inputs: { "design.check_valve_at_tie_in": false } });
    expect(e.byStage["4"]?.noGo).toContain("R-CTL-01");

    const gate4 = (await getStageDetail(db, pid, "4"))!.gate.results.find((r) => r.id === "pid_rules");
    expect(gate4).toMatchObject({ met: false, failure: "rules_no_go" });

    await expect(overrideNoGo(db, as("OAM"), { projectId: pid, ruleId: "R-CTL-01", reason: "Zdůvodnění přepsání" })).rejects.toThrow(
      ForbiddenError,
    );
    await expect(overrideNoGo(db, as("PROCESS_SAFETY"), { projectId: pid, ruleId: "R-CTL-01", reason: "krátké" })).rejects.toThrow();
    await expect(
      overrideNoGo(db, as("PROCESS_SAFETY"), { projectId: pid, ruleId: "R-PSV-02", reason: "Nelze, není NO-GO." }),
    ).rejects.toThrow("NOT_NO_GO");
    const overrideId = await overrideNoGo(db, as("PROCESS_SAFETY"), {
      projectId: pid,
      ruleId: "R-CTL-01",
      reason: "Zpětný tok vyloučen jiným opatřením (demo).",
    });
    await expect(
      overrideNoGo(db, as("PROCESS_SAFETY"), { projectId: pid, ruleId: "R-CTL-01", reason: "Podruhé stejné přepsání." }),
    ).rejects.toThrow("ALREADY_OVERRIDDEN");
    e = (await evaluateProject(db, pid))!;
    expect(ctl()).toMatchObject({ result: "NO-GO", blocking: false });
    expect(ctl().override?.id).toBe(overrideId);
    expect(e.counts.overridden).toBe(1);

    // Same inputs again → same fingerprint → the override still applies.
    await saveDesignInputs(db, as("ROC"), { projectId: pid, answers: { "control.check_valve_at_tie_in": "true" } });
    await saveDesignInputs(db, as("ROC"), { projectId: pid, answers: { "control.check_valve_at_tie_in": "false" } });
    e = (await evaluateProject(db, pid))!;
    expect(ctl().override?.id).toBe(overrideId);
    expect(ctl().blocking).toBe(false);

    // Different inputs → different fingerprint → the override no longer applies.
    const psv = () => e.results.find((r) => r.ruleId === "R-PSV-01")!;
    await saveDesignInputs(db, as("ROC"), {
      projectId: pid,
      answers: {
        "relief.psv_on_all_trapped_sections": "true",
        "relief.psv_max_set_pressure": { input: "12", unit: "bar(g)" },
        "relief.mawp_min": { input: "10", unit: "bar(g)" },
      },
    });
    e = (await evaluateProject(db, pid))!;
    expect(psv().result).toBe("NO-GO");
    await overrideNoGo(db, as("PROCESS_SAFETY"), { projectId: pid, ruleId: "R-PSV-01", reason: "Demo: dočasně přepsáno pro test." });
    e = (await evaluateProject(db, pid))!;
    expect(psv().blocking).toBe(false);
    await saveDesignInputs(db, as("ROC"), { projectId: pid, answers: { "relief.psv_max_set_pressure": { input: "13", unit: "bar(g)" } } });
    e = (await evaluateProject(db, pid))!;
    expect(psv()).toMatchObject({ result: "NO-GO", blocking: true, override: null });

    await revokeOverride(db, as("PROCESS_SAFETY"), { overrideId, reason: "Opatření zrušeno" });
    e = (await evaluateProject(db, pid))!;
    expect(ctl().blocking).toBe(true);
    expect((await listOverrides(db, pid)).find((o) => o.id === overrideId)?.revokedAt).not.toBeNull();
    await expect(revokeOverride(db, as("PROCESS_SAFETY"), { overrideId, reason: "znovu" })).rejects.toThrow("NOT_FOUND");
  });

  it("step 4 closes once the P&ID rules are evaluated without NO-GO", async () => {
    const pid = await project("N2");
    // TEST VALUE ONLY – R-CTL-02 needs its hysteresis parameter before it can be evaluated.
    await updateRule(db, as("PROCESS_SAFETY"), {
      ruleId: "R-CTL-02",
      parameters: { switchover_hysteresis: { N2: { input: "0,5", unit: "bar(g)" }, O2: { input: "0,5", unit: "bar(g)" } } },
      changeNote: "test: hodnota pro integrační test",
    });
    await saveAnswers(db, as("OAM"), {
      projectId: pid,
      answers: {
        "pressure.source_type": "psa",
        "pressure.source_pressure": { input: "8", unit: "bar(g)" },
        "utilities.telemetry": "true",
        "utilities.alarm_contact": "Dispečink (demo)",
      },
    });
    await saveDesignInputs(db, as("ROC"), {
      projectId: pid,
      answers: {
        "materials.materials_suitable_min_temp": "true",
        "materials.carbon_steel_below_min_temp": "false",
        "materials.downstream_material_cold_ok": "true",
        "materials.low_temp_protection": "true",
        "relief.psv_on_all_trapped_sections": "true",
        "relief.psv_max_set_pressure": { input: "10", unit: "bar(g)" },
        "relief.mawp_min": { input: "12", unit: "bar(g)" },
        "relief.vent_discharge_safe": "true",
        "control.check_valve_at_tie_in": "true",
        "control.switchover_pressure": { input: "6", unit: "bar(g)" },
        "control.esd_defined": "true",
        "control.esd_accessible": "true",
        "monitoring.level_pressure_alarms_to_telemetry": "true",
      },
    });
    const e = (await evaluateProject(db, pid))!;
    expect(e.byStage["4"]).toEqual({ noGo: [], notEvaluated: [] });
    const gate = (await getStageDetail(db, pid, "4"))!.gate.results.find((r) => r.id === "pid_rules");
    expect(gate?.met).toBe(true);
  });

  it("rejects invalid checklist values and freezes the checklist when step 4 is closed", async () => {
    const pid = await project("O2");
    const err = await saveDesignInputs(db, as("ROC"), { projectId: pid, answers: { "o2.o2_max_velocity": { input: "-1", unit: "m/s" } } }).catch(
      (x) => x,
    );
    expect(err.errors).toEqual({ "o2.o2_max_velocity": "negative" });
    expect(await saveDesignInputs(db, as("ROC"), { projectId: pid, answers: {} })).toBe(0);
    await db.update(stages).set({ state: "CLOSED" }).where(and(eq(stages.projectId, pid), eq(stages.key, "4")));
    await expect(
      saveDesignInputs(db, as("ROC"), { projectId: pid, answers: { "control.esd_defined": "true" } }),
    ).rejects.toThrow("STAGE_CLOSED");
  });

  it("layout geometry: step 3 gate needs complete v0 dimensions; rules use the latest layout", async () => {
    const pid = await project("N2");
    const s3 = (await getStageDetail(db, pid, "3"))!.stage.id;
    expect(await layoutGeometryStatus(db, pid, "N2")).toEqual({ concept: null, final: null });
    await expect(saveLayoutGeometry(db, as("OPS"), { projectId: pid, version: 0, answers: {} })).rejects.toThrow("NO_LAYOUT_VERSION");
    await addLayoutVersion(db, as("OPS"), { stageId: s3, label: "v0", drawingUrl: "https://demo.sharepoint.com/v0" });
    await expect(
      saveLayoutGeometry(db, as("ROC"), { projectId: pid, version: 0, answers: { "access.escape_route_clear": "true" } }),
    ).rejects.toThrow(ForbiddenError);
    await saveLayoutGeometry(db, as("OPS"), {
      projectId: pid,
      version: 0,
      answers: { "access.escape_route_clear": "true", "access.escape_route_outside_release_zone": "false", "distances.dist_buildings": { input: "12", unit: "m" } },
    });
    const status = await layoutGeometryStatus(db, pid, "N2");
    expect(status.concept).toBeGreaterThan(0);
    const gate3 = (await getStageDetail(db, pid, "3"))!.gate.results.find((r) => r.id === "layout_dimensions");
    expect(gate3).toMatchObject({ met: false, failure: "geometry_incomplete" });

    const e = (await evaluateProject(db, pid))!;
    expect(e.layoutVersion).toBe(0);
    expect(e.results.find((r) => r.ruleId === "R-ACC-02")?.result).toBe("NO-GO");
    expect(e.inputs["layout.dist_buildings"]).toBe(12);
    const err = await saveLayoutGeometry(db, as("OPS"), { projectId: pid, version: 0, answers: { "x.y": "1" } }).catch((x) => x);
    expect(err.errors).toEqual({ "x.y": "unknown_question" });
  });

  it("rule versioning and verification by Process Safety", async () => {
    const before = (await getRuleHistory(db, "R-SD-01"))[0]!;
    await expect(updateRule(db, as("OPS"), { ruleId: "R-SD-01", changeNote: "x" })).rejects.toThrow(ForbiddenError);
    await expect(
      updateRule(db, as("PROCESS_SAFETY"), {
        ruleId: "R-SD-01",
        parameters: { min_dist_buildings: { O2: { input: "1", unit: "h" } } },
        changeNote: "wrong unit",
      }),
    ).rejects.toThrow("INVALID_UNIT");
    await expect(updateRule(db, as("PROCESS_SAFETY"), { ruleId: "R-NOPE-01", changeNote: "x" })).rejects.toThrow("NOT_FOUND");

    // TEST VALUES ONLY – not engineering values.
    const v = await updateRule(db, as("PROCESS_SAFETY"), {
      ruleId: "R-SD-01",
      parameters: { min_dist_buildings: { O2: { input: "1", unit: "m" } } },
      changeNote: "test: částečné doplnění",
    });
    expect(v).toBe(before.rule.version + 1);
    const err = await verifyRule(db, as("PROCESS_SAFETY"), { ruleId: "R-SD-01", version: v }).catch((x) => x);
    expect(err).toBeInstanceOf(SafetyServiceError);
    expect(err.code).toBe("MISSING_PARAMETERS");
    await expect(verifyRule(db, as("PROCESS_SAFETY"), { ruleId: "R-SD-01", version: before.rule.version })).rejects.toThrow(
      "NOT_LATEST_VERSION",
    );

    // CTL-01 has no parameters but its source clause is TBD → cannot be verified until filled in.
    const ctl = (await getRuleHistory(db, "R-CTL-01"))[0]!;
    if (ctl.status !== "VERIFIED") {
      const ctlLatest = ctl.rule.source.clause === "TBD-VERIFY" ? ctl.rule.version : null;
      if (ctlLatest) {
        await expect(verifyRule(db, as("PROCESS_SAFETY"), { ruleId: "R-CTL-01", version: ctlLatest })).rejects.toThrow("SOURCE_TBD");
      }
      const v2 = await updateRule(db, as("ADMIN"), {
        ruleId: "R-CTL-01",
        source: { document: "Interní standard (test)", clause: "test 1.2" },
        changeNote: "test: citace",
      });
      await expect(verifyRule(db, as("ADMIN"), { ruleId: "R-CTL-01", version: v2 })).rejects.toThrow(ForbiddenError);
      await verifyRule(db, as("PROCESS_SAFETY"), { ruleId: "R-CTL-01", version: v2 });
      await expect(verifyRule(db, as("PROCESS_SAFETY"), { ruleId: "R-CTL-01", version: v2 })).rejects.toThrow("ALREADY_VERIFIED");
    }
    const verified = (await listCurrentRules(db)).find((r) => r.rule.id === "R-CTL-01")!;
    expect(verified.status).toBe("VERIFIED");
    expect(verified.rule.verifiedBy).toBe(verified.verifiedBy);

    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.action, "rule.verify"), eq(auditLog.entityType, "rule")));
    expect(entry).toBeDefined();
  });

  it("standards: verification requires a revision; editing resets to DRAFT; step 5 gate", async () => {
    const pid = await project("N2");
    const status = await verificationStatus(db, "N2");
    expect(status.standardsCount).toBeGreaterThan(0);
    const gate5 = (await getStageDetail(db, pid, "5"))!.gate.results.find((r) => r.id === "standards_verified");
    expect(gate5?.met).toBe(false);
    expect(["unverified_standards", "unverified_rules"]).toContain(gate5?.failure);

    const std = (await listStandards(db)).find((s) => s.code === "EIGA Doc 44")!;
    await expect(verifyStandard(db, as("OAM"), { standardId: std.id })).rejects.toThrow(ForbiddenError);
    if (std.status === "DRAFT" && !std.revision) {
      await expect(verifyStandard(db, as("PROCESS_SAFETY"), { standardId: std.id })).rejects.toThrow("REVISION_MISSING");
    }
    await updateStandard(db, as("PROCESS_SAFETY"), { standardId: std.id, revision: "test-rev", notes: "", appliesTo: ["N2"] });
    await verifyStandard(db, as("PROCESS_SAFETY"), { standardId: std.id });
    expect((await listStandards(db)).find((s) => s.id === std.id)?.status).toBe("VERIFIED");
    await updateStandard(db, as("ADMIN"), { standardId: std.id, revision: "test-rev-2", notes: "x", appliesTo: ["N2"] });
    expect((await listStandards(db)).find((s) => s.id === std.id)?.status).toBe("DRAFT");
    expect((await verificationStatus(db, "N2")).unverifiedStandards).toContain("EIGA Doc 44");
  });

  it("snapshots store reproducible rows per applicable rule", async () => {
    const pid = await project("O2");
    await expect(saveEvaluationSnapshot(db, as("OPS"), { projectId: pid })).rejects.toThrow(ForbiddenError);
    const runId = await saveEvaluationSnapshot(db, as("PROCESS_SAFETY"), { projectId: pid });
    const rows = await db.select().from(ruleEvaluations).where(eq(ruleEvaluations.runId, runId));
    expect(rows).toHaveLength(21);
    expect(rows.every((r) => r.ruleVersion >= 1 && r.inputs !== null)).toBe(true);
    const runs = await listSnapshots(db, pid);
    expect(runs[0]).toMatchObject({ runId });
    await expect(saveEvaluationSnapshot(db, as("OAM"), { projectId: "11111111-1111-4111-8111-111111111111" })).rejects.toThrow(
      "NOT_FOUND",
    );
  });
});
