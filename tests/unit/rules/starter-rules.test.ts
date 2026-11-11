import { describe, expect, it } from "vitest";
import { DESIGN_CHECKLIST_FORM, LAYOUT_GEOMETRY_FORM } from "@/lib/forms";
import { allQuestions, DEFAULT_QUESTIONNAIRE } from "@/lib/questionnaire/template";
import { loadRuleFiles } from "@/lib/rules/catalog";
import { collectRefs, type Primitive } from "@/lib/rules/expr";
import { evaluateRule, missingParameters, type Rule } from "@/lib/rules/rule";
import { quantity, type UnitId } from "@/lib/units";
import { DEFAULT_TEMPLATE } from "@/lib/workflow/template";

const RULES = loadRuleFiles();
const byId = new Map(RULES.map((r) => [r.id, r]));

/**
 * TEST FIXTURES ONLY. These numbers exercise the evaluator; they are NOT
 * engineering values and must never be copied into rule parameters.
 */
const TEST_PARAM: Record<string, [number, UnitId]> = {
  min_dist_buildings: [10, "m"],
  min_dist_public_roads: [10, "m"],
  min_dist_boundary: [10, "m"],
  min_dist_ignition_sources: [10, "m"],
  min_dist_low_points: [10, "m"],
  o2_max_velocity_limit: [10, "m/s"],
  capacity_margin_factor: [100, "%"],
  min_dist_cooling_towers: [10, "m"],
  switchover_hysteresis: [1, "bar(g)"],
  min_access_width: [1, "m"],
};

function withTestParams(rule: Rule): Rule {
  return {
    ...rule,
    parameters: rule.parameters.map((p) => ({
      ...p,
      values: Object.fromEntries(rule.appliesTo.map((m) => [m, quantity(...TEST_PARAM[p.key]!)])),
    })),
  };
}

type Inputs = Record<string, Primitive>;
const far = 20; // > test distance
const near = 5; // < test distance

/** For each rule: inputs that pass and inputs that fail. */
const CASES: Record<string, { go: Inputs; fail: Inputs }> = {
  "R-SD-01": {
    go: { "layout.dist_buildings": far, "layout.dist_public_roads": far, "layout.dist_boundary": far, "layout.dist_ignition_sources": far },
    fail: { "layout.dist_buildings": far, "layout.dist_public_roads": near, "layout.dist_boundary": far, "layout.dist_ignition_sources": far },
  },
  "R-SD-02": {
    go: { "db.lowPointsNearby": true, "layout.dist_low_points": far },
    fail: { "db.lowPointsNearby": true, "layout.dist_low_points": near },
  },
  "R-O2-01": {
    go: { "design.o2_cleaning_documented": true, "design.o2_material_compatibility": true },
    fail: { "design.o2_cleaning_documented": false, "design.o2_material_compatibility": true },
  },
  "R-O2-02": {
    go: { "layout.surface_under_filling": "concrete", "layout.combustibles_in_spill_zone": false },
    fail: { "layout.surface_under_filling": "asphalt", "layout.combustibles_in_spill_zone": false },
  },
  "R-O2-03": {
    go: { "design.o2_max_velocity": 5, "design.o2_pipe_material_ok": true },
    fail: { "design.o2_max_velocity": 15, "design.o2_pipe_material_ok": true },
  },
  "R-MAT-01": {
    go: { "design.materials_suitable_min_temp": true, "design.carbon_steel_below_min_temp": false },
    fail: { "design.materials_suitable_min_temp": true, "design.carbon_steel_below_min_temp": true },
  },
  "R-VAP-01": {
    go: { "design.downstream_material_cold_ok": false, "design.low_temp_protection": true },
    fail: { "design.downstream_material_cold_ok": false, "design.low_temp_protection": false },
  },
  "R-VAP-02": {
    go: { "sizing.capacity_after_icing": 0.3, "db.qPeak": 0.2 },
    fail: { "sizing.capacity_after_icing": 0.1, "db.qPeak": 0.2 },
  },
  "R-VAP-03": {
    go: { "db.coolingTowersNearby": true, "layout.dist_vap_cooling_towers": far, "layout.vap_airflow_obstructed": false },
    fail: { "db.coolingTowersNearby": true, "layout.dist_vap_cooling_towers": near, "layout.vap_airflow_obstructed": false },
  },
  "R-PSV-01": {
    go: { "design.psv_on_all_trapped_sections": true, "design.psv_max_set_pressure": 1.0e6, "design.mawp_min": 1.2e6 },
    fail: { "design.psv_on_all_trapped_sections": true, "design.psv_max_set_pressure": 1.3e6, "design.mawp_min": 1.2e6 },
  },
  "R-PSV-02": { go: { "design.vent_discharge_safe": true }, fail: { "design.vent_discharge_safe": false } },
  "R-CTL-01": { go: { "design.check_valve_at_tie_in": true }, fail: { "design.check_valve_at_tie_in": false } },
  "R-CTL-02": {
    go: { "design.switchover_pressure": 5e5, "db.sourcePressure": 8e5 },
    fail: { "design.switchover_pressure": 7.5e5, "db.sourcePressure": 8e5 },
  },
  "R-CTL-03": {
    go: { "design.esd_defined": true, "design.esd_accessible": true },
    fail: { "design.esd_defined": true, "design.esd_accessible": false },
  },
  "R-FIL-01": {
    go: {
      "layout.tanker_access_verified": true,
      "layout.earthing_available": true,
      "layout.hose_reach_ok": true,
      "layout.tanker_under_piping": false,
      "layout.tanker_over_underground_utilities": false,
    },
    fail: {
      "layout.tanker_access_verified": true,
      "layout.earthing_available": true,
      "layout.hose_reach_ok": true,
      "layout.tanker_under_piping": true,
      "layout.tanker_over_underground_utilities": false,
    },
  },
  "R-ACC-01": {
    go: { "layout.min_access_width": 1.5, "layout.access_blocked": false },
    fail: { "layout.min_access_width": 0.5, "layout.access_blocked": false },
  },
  "R-ACC-02": {
    go: { "layout.escape_route_clear": true, "layout.escape_route_outside_release_zone": true },
    fail: { "layout.escape_route_clear": false, "layout.escape_route_outside_release_zone": true },
  },
  "R-CAP-01": {
    go: { "calc.autonomy": 30 * 3600, "db.requiredAutonomy": 24 * 3600 },
    fail: { "calc.autonomy": 12 * 3600, "db.requiredAutonomy": 24 * 3600 },
  },
  "R-ENV-01": {
    go: { "sizing.design_ambient_min_temp": 248.15, "db.designTempMin": 253.15, "sizing.icing_considered": true },
    fail: { "sizing.design_ambient_min_temp": 258.15, "db.designTempMin": 253.15, "sizing.icing_considered": true },
  },
  "R-MON-01": {
    go: { "db.telemetryAvailable": true, "design.level_pressure_alarms_to_telemetry": true, "db.alarmContact": "Dispečink" },
    fail: { "db.telemetryAvailable": true, "design.level_pressure_alarms_to_telemetry": false, "db.alarmContact": "Dispečink" },
  },
  "R-SIG-01": {
    go: { "layout.signage_ok": true, "layout.fencing_ok": true, "layout.impact_protection_ok": true },
    fail: { "layout.signage_ok": true, "layout.fencing_ok": false, "layout.impact_protection_ok": true },
  },
};

describe("starter rule set (SPEC §7.2)", () => {
  it("contains exactly the 21 rules of the specification", () => {
    expect(RULES.map((r) => r.id).sort()).toEqual(Object.keys(CASES).sort());
    expect(RULES).toHaveLength(21);
  });

  it("every rule is DRAFT, unverified and has no parameter values (TBD-VERIFY)", () => {
    for (const r of RULES) {
      expect(r.status).toBe("DRAFT");
      expect(r.verifiedBy).toBeNull();
      expect(r.source.clause).toBe("TBD-VERIFY");
      for (const p of r.parameters) for (const m of r.appliesTo) expect(p.values[m] ?? null).toBeNull();
      expect(missingParameters(r)).toEqual(r.parameters.map((p) => p.key));
    }
  });

  it("references only inputs that the application can supply and existing process steps", () => {
    const formNames = (form: typeof LAYOUT_GEOMETRY_FORM, prefix: string) =>
      allQuestions(form).map((q) => `${prefix}.${q.id.slice(q.id.indexOf(".") + 1)}`);
    const available = new Set([
      ...formNames(LAYOUT_GEOMETRY_FORM, "layout"),
      ...formNames(DESIGN_CHECKLIST_FORM, "design"),
      ...allQuestions(DEFAULT_QUESTIONNAIRE).filter((q) => q.designBasis).map((q) => `db.${q.designBasis}`),
      "sizing.capacity_after_icing",
      "sizing.design_ambient_min_temp",
      "sizing.icing_considered",
      "calc.autonomy",
    ]);
    const stageKeys = new Set(DEFAULT_TEMPLATE.stages.map((s) => s.key));
    for (const r of RULES) {
      for (const i of collectRefs(r.condition).inputs) expect(available, `${r.id}: ${i}`).toContain(i);
      for (const s of r.stages) expect(stageKeys).toContain(s);
    }
  });

  it("form question names are unique per form (they become rule input keys)", () => {
    for (const form of [LAYOUT_GEOMETRY_FORM, DESIGN_CHECKLIST_FORM]) {
      const names = allQuestions(form).map((q) => q.id.slice(q.id.indexOf(".") + 1));
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe.each(RULES.map((r) => [r.id, r] as const))("%s", (_id, rawRule) => {
  const rule = withTestParams(rawRule);
  const medium = rule.appliesTo[0]!;
  const cases = CASES[rule.id]!;

  it("GO when the condition holds", () => {
    expect(evaluateRule(rule, medium, cases.go)?.result).toBe("GO");
  });

  it(`${rule.severity} when the condition fails`, () => {
    const e = evaluateRule(rule, medium, cases.fail)!;
    expect(e.result).toBe(rule.severity);
    expect(e.ruleVersion).toBe(rule.version);
  });

  it("NEVYHODNOCENO when inputs are missing", () => {
    const e = evaluateRule(rule, medium, {})!;
    expect(e.result).toBe("NOT_EVALUATED");
    expect(e.missingInputs.length).toBeGreaterThan(0);
  });

  it("NEVYHODNOCENO (never GO) with the shipped parameters when the rule has parameters", () => {
    const e = evaluateRule(byId.get(rule.id)!, medium, cases.go)!;
    if (rawRule.parameters.length) {
      expect(e.result).toBe("NOT_EVALUATED");
      expect(e.missingParams).toEqual(rawRule.parameters.map((p) => p.key).sort());
    } else {
      expect(e.result).toBe("GO");
    }
  });
});

describe("medium applicability", () => {
  it("O₂-only rules are not evaluated for N₂ projects", () => {
    expect(evaluateRule(byId.get("R-O2-01")!, "N2", {})).toBeNull();
  });
});
