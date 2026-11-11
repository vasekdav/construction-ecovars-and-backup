import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { roleAssignments, users } from "@/db/schema";
import type { Role } from "@/lib/auth/roles";
import { renderMarkdown } from "@/lib/export/markdown";
import { APP_VERSION, buildReport } from "@/lib/export/report";
import { saveAnswers } from "@/lib/questionnaire/service";
import { overrideNoGo, saveDesignInputs } from "@/lib/safety/project";
import { createProject, type Actor } from "@/lib/workflow/service";
import { hasDb, setupTestDb, uniqueEmail } from "./db";

describe.skipIf(!hasDb)("export report model (Postgres)", () => {
  let db: Db;
  let close: () => Promise<void>;
  const actors: Partial<Record<Role, Actor>> = {};

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    for (const role of ["OAM", "ROC", "PROCESS_SAFETY"] as Role[]) {
      const [u] = await db
        .insert(users)
        .values({ email: uniqueEmail(role.toLowerCase()), name: `E ${role}`, passwordHash: "x" })
        .returning({ id: users.id });
      await db.insert(roleAssignments).values({ userId: u!.id, role });
      actors[role] = { id: u!.id, roles: [role] };
    }
  });
  afterAll(async () => close?.());

  it("collects versions, results, overrides, Design Basis and steps", async () => {
    const pid = await createProject(db, actors.OAM!, { name: "Export | projekt", customer: "Demo", location: "Demo", medium: "O2" });
    await saveAnswers(db, actors.OAM!, { projectId: pid, answers: { "consumption.q_peak": { input: "200", unit: "Nm3/h" } } });
    await saveDesignInputs(db, actors.ROC!, { projectId: pid, answers: { "control.check_valve_at_tie_in": "false" } });
    await overrideNoGo(db, actors.PROCESS_SAFETY!, { projectId: pid, ruleId: "R-CTL-01", reason: "Demo: override pro export test." });

    const m = (await buildReport(db, pid, { name: "Tester" }, "cs"))!;
    expect(m.meta).toMatchObject({ appVersion: APP_VERSION, generatedBy: "Tester", locale: "cs" });
    expect(m.meta.disclaimer).toBe("Podpora rozhodování, nenahrazuje inženýrské schválení.");
    expect(m.project).toMatchObject({ name: "Export | projekt", medium: "O₂ (kyslík)", owner: "E OAM" });
    expect(m.steps).toHaveLength(10);
    expect(m.safety.rules).toHaveLength(21);
    const ctl = m.safety.rules.find((r) => r.id === "R-CTL-01")!;
    expect(ctl).toMatchObject({ result: "NO-GO", overridden: true, resultLabel: "NO-GO (OVERRIDE)" });
    expect(ctl.version).toBeGreaterThanOrEqual(1);
    expect(ctl.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(m.overrides[0]).toMatchObject({ ruleId: "R-CTL-01", state: "applied", by: "E PROCESS_SAFETY" });

    // Changing the inputs makes the override stale; the export must say so instead of "applies".
    await saveDesignInputs(db, actors.ROC!, { projectId: pid, answers: { "control.check_valve_at_tie_in": "true" } });
    const after = (await buildReport(db, pid, { name: "Tester" }, "cs"))!;
    expect(after.overrides[0]).toMatchObject({ ruleId: "R-CTL-01", state: "stale" });
    await saveDesignInputs(db, actors.ROC!, { projectId: pid, answers: { "control.check_valve_at_tie_in": "false" } });
    expect(m.designBasis.find((d) => d.key === "qPeak")).toMatchObject({ value: "200 Nm³/h", source: "consumption.q_peak" });
    expect(m.sizing).toBeNull();
    expect(m.standards.length).toBeGreaterThan(0);
    expect(m.autonomy.params.map((p) => p.key)).toEqual(["fill_max", "heel_fraction", "rho_liquid", "rho_gas_normal"]);

    const md = renderMarkdown(m);
    expect(md).toContain("Export \\| projekt");

    const en = (await buildReport(db, pid, { name: "Tester" }, "en"))!;
    expect(en.meta.disclaimer).toBe("Decision support only, does not replace engineering approval.");
    expect(await buildReport(db, "11111111-1111-4111-8111-111111111111", { name: "x" })).toBeNull();
  });
});
