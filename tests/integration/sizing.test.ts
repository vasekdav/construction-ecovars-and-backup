import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { projects, roleAssignments, stages, users } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/roles";
import { AUTONOMY_KEY, getCalcConfigHistory, getCurrentCalcConfig, syncCalcConfigs, loadCalcConfigFile, updateCalcConfig, verifyCalcConfig } from "@/lib/calc/config-service";
import { saveAnswers } from "@/lib/questionnaire/service";
import { FormValidationError } from "@/lib/safety/errors";
import { evaluateProject, verificationStatus } from "@/lib/safety/project";
import { getSizingHistory, projectAutonomy, recordSizingResult, sizingRuleInputs } from "@/lib/sizing/service";
import { getStageDetail } from "@/lib/workflow/queries";
import { createProject, type Actor } from "@/lib/workflow/service";
import { hasDb, setupTestDb, uniqueEmail } from "./db";

/** A complete sizing record (fictitious; TEST VALUES ONLY). */
const SIZING = (over: Record<string, unknown> = {}) => ({
  "source.file_name": "AAE_demo.xlsx",
  "source.file_revision": "R3",
  "source.author": "Demo Sizing",
  "source.date": "2026-11-01",
  "source.link": "https://demo.sharepoint.com/aae.xlsx",
  "inputs.tank_volume": { input: "20", unit: "m3" },
  "inputs.design_flow": { input: "400", unit: "Nm3/h" },
  "inputs.design_ambient_min_temp": { input: "-25", unit: "°C" },
  "inputs.icing_considered": "true",
  "result.capacity_after_icing": { input: "500", unit: "Nm3/h" },
  "result.vaporizer_type": "Demo AAE",
  "result.module_count": "2",
  ...over,
});

describe.skipIf(!hasDb)("sizing result and autonomy (Postgres)", () => {
  let db: Db;
  let close: () => Promise<void>;
  const actors: Partial<Record<Role, Actor>> = {};
  const as = (r: Role) => actors[r]!;

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    for (const role of ["OAM", "SIZING", "PROCESS_SAFETY", "OPS"] as Role[]) {
      const [u] = await db
        .insert(users)
        .values({ email: uniqueEmail(role.toLowerCase()), name: `Z ${role}`, passwordHash: "x" })
        .returning({ id: users.id });
      await db.insert(roleAssignments).values({ userId: u!.id, role });
      actors[role] = { id: u!.id, roles: [role] };
    }
  });
  afterAll(async () => close?.());

  const project = () => createProject(db, as("OAM"), { name: "Sizing projekt", customer: "Demo", location: "Demo", medium: "N2" });

  it("records complete, immutable sizing versions with a source; only Sizing responsible", async () => {
    const pid = await project();
    await expect(recordSizingResult(db, as("OPS"), { projectId: pid, answers: SIZING() })).rejects.toThrow(ForbiddenError);
    const err = await recordSizingResult(db, as("SIZING"), {
      projectId: pid,
      answers: SIZING({ "source.file_revision": "", "source.link": "http://insecure.example" }),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(FormValidationError);
    expect(err.errors).toEqual({ "source.link": "invalid_url", "source.file_revision": "required" });

    expect(await recordSizingResult(db, as("SIZING"), { projectId: pid, answers: SIZING() })).toBe(1);
    expect(await recordSizingResult(db, as("SIZING"), { projectId: pid, answers: SIZING({ "source.file_revision": "R4" }) })).toBe(2);
    const history = await getSizingHistory(db, pid);
    expect(history.map((h) => h.version)).toEqual([2, 1]);
    expect(history[1]!.answers["source.file_revision"]).toBe("R3");
    expect(sizingRuleInputs(history[0]!.answers)).toEqual({
      capacity_after_icing: 500 / 3600,
      design_ambient_min_temp: 248.14999999999998,
      icing_considered: true,
    });

    const gate = (await getStageDetail(db, pid, "8"))!.gate.results.find((r) => r.id === "sizing_result");
    expect(gate?.met).toBe(true);
  });

  it("step 8 gate fails without sizing; sizing is frozen when step 8 is closed", async () => {
    const pid = await project();
    expect((await getStageDetail(db, pid, "8"))!.gate.results.find((r) => r.id === "sizing_result")).toMatchObject({
      met: false,
      failure: "no_sizing",
    });
    await db.update(stages).set({ state: "CLOSED" }).where(and(eq(stages.projectId, pid), eq(stages.key, "8")));
    await expect(recordSizingResult(db, as("SIZING"), { projectId: pid, answers: SIZING() })).rejects.toThrow("STAGE_CLOSED");
  });

  it("autonomy stays NEVYHODNOCENO with the shipped (empty) parameters", async () => {
    const pid = await project();
    await recordSizingResult(db, as("SIZING"), { projectId: pid, answers: SIZING() });
    const [p] = await db.select().from(projects).where(eq(projects.id, pid));
    const current = await getCurrentCalcConfig(db, AUTONOMY_KEY);
    const a = await projectAutonomy(db, p!);
    if (current?.config.version === 1) {
      expect(a.result.status).toBe("NOT_EVALUATED");
      expect(a.result.missingParams).toEqual(["fill_max", "heel_fraction", "rho_liquid", "rho_gas_normal"]);
    }
    expect(a.inputs.tankVolume).toBe(20);
    expect(await syncCalcConfigs(db, [loadCalcConfigFile()])).toBe(0);
  });

  it("with test parameters: R-CAP-01 GO / NO-GO, R-VAP-02 / R-ENV-01 get sizing inputs; config versioning + verification", async () => {
    await expect(updateCalcConfig(db, as("OPS"), {})).rejects.toThrow(ForbiddenError);
    // TEST VALUES ONLY – arbitrary round numbers, not physical properties.
    const v = await updateCalcConfig(db, as("PROCESS_SAFETY"), {
      key: AUTONOMY_KEY,
      parameters: {
        fill_max: { O2: { input: "50", unit: "%" }, N2: { input: "50", unit: "%" } },
        heel_fraction: { O2: { input: "20", unit: "%" }, N2: { input: "20", unit: "%" } },
        rho_liquid: { O2: { input: "1000", unit: "kg/m3" }, N2: { input: "1000", unit: "kg/m3" } },
        rho_gas_normal: { O2: { input: "2", unit: "kg/m3" }, N2: { input: "2", unit: "kg/m3" } },
      },
      normalConditions: "TBD-VERIFY",
      source: { document: "test", clause: "TBD-VERIFY" },
      changeNote: "test: hodnoty pro integrační test",
    });
    await expect(verifyCalcConfig(db, as("PROCESS_SAFETY"), { key: AUTONOMY_KEY, version: v })).rejects.toThrow("MISSING_PARAMETERS");
    await expect(
      updateCalcConfig(db, as("PROCESS_SAFETY"), {
        key: AUTONOMY_KEY,
        parameters: { fill_max: { N2: { input: "1", unit: "kg/m3" } } },
        normalConditions: "x",
        source: { document: "x", clause: "x" },
        changeNote: "bad unit",
      }),
    ).rejects.toThrow("INVALID_UNIT");

    const pid = await project();
    // gas = 20 · 0.5 · 0.8 · 500 = 4000 Nm³; Q_peak 400 Nm³/h → 10 h
    await saveAnswers(db, as("OAM"), {
      projectId: pid,
      answers: {
        "consumption.q_peak": { input: "400", unit: "Nm3/h" },
        "consumption.q_avg": { input: "200", unit: "Nm3/h" },
        "autonomy.required": { input: "8", unit: "h" },
        "site.temp_min": { input: "-20", unit: "°C" },
      },
    });
    await recordSizingResult(db, as("SIZING"), { projectId: pid, answers: SIZING() });
    const [p] = await db.select().from(projects).where(eq(projects.id, pid));
    const a = await projectAutonomy(db, p!);
    expect(a.result.status).toBe("OK");
    expect(a.result.autonomyPeak! / 3600).toBeCloseTo(10, 9);
    expect(a.result.autonomyAvg! / 3600).toBeCloseTo(20, 9);
    expect(a.result.meetsRequirement).toBe(true);

    let e = (await evaluateProject(db, pid))!;
    const res = (id: string) => e.results.find((r) => r.ruleId === id)!;
    expect(res("R-CAP-01").result).toBe("GO");
    expect(res("R-CAP-01").inputs["calc.autonomy"]).toBeCloseTo(36000, 6);
    expect(res("R-ENV-01").result).toBe("GO"); // −25 °C sizing ≤ −20 °C site, icing considered
    expect(res("R-VAP-02").missingParams).toEqual(["capacity_margin_factor"]);

    await saveAnswers(db, as("OAM"), { projectId: pid, answers: { "autonomy.required": { input: "12", unit: "h" } } });
    e = (await evaluateProject(db, pid))!;
    expect(res("R-CAP-01").result).toBe("NO-GO");

    // Step 5 also requires the calculation config to be VERIFIED.
    const status = await verificationStatus(db, "N2");
    expect(status.unverifiedCalc).toEqual([`${AUTONOMY_KEY}@${v}`]);

    const v2 = await updateCalcConfig(db, as("PROCESS_SAFETY"), {
      key: AUTONOMY_KEY,
      parameters: {},
      normalConditions: "test: normal conditions",
      source: { document: "test", clause: "1.1" },
      changeNote: "test: texty",
    });
    await expect(verifyCalcConfig(db, as("OAM"), { key: AUTONOMY_KEY, version: v2 })).rejects.toThrow(ForbiddenError);
    await expect(verifyCalcConfig(db, as("PROCESS_SAFETY"), { key: AUTONOMY_KEY, version: v })).rejects.toThrow("NOT_LATEST_VERSION");
    await verifyCalcConfig(db, as("PROCESS_SAFETY"), { key: AUTONOMY_KEY, version: v2 });
    await expect(verifyCalcConfig(db, as("PROCESS_SAFETY"), { key: AUTONOMY_KEY, version: v2 })).rejects.toThrow("ALREADY_VERIFIED");
    expect((await verificationStatus(db, "N2")).unverifiedCalc).toEqual([]);
    expect((await getCalcConfigHistory(db, AUTONOMY_KEY))[0]?.status).toBe("VERIFIED");
    await expect(updateCalcConfig(db, as("PROCESS_SAFETY"), { key: "nope", normalConditions: "x", source: { document: "x", clause: "x" }, changeNote: "x" })).rejects.toThrow("NOT_FOUND");
    await expect(verifyCalcConfig(db, as("PROCESS_SAFETY"), { key: "nope", version: 1 })).rejects.toThrow("NOT_FOUND");
  });
});
