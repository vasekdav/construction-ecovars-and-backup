import { describe, expect, it } from "vitest";
import { buildRuleInputs } from "@/lib/rules/inputs";
import { evaluateRule, evaluationFingerprint, ruleIssues, ruleSchema, type Rule } from "@/lib/rules/rule";
import { DESIGN_CHECKLIST_FORM, LAYOUT_GEOMETRY_FORM } from "@/lib/forms";
import { quantity } from "@/lib/units";

const L = { cs: "x", en: "x" };
const base: Rule = {
  id: "R-TST-01",
  version: 1,
  category: "Test",
  appliesTo: ["O2"],
  title: L,
  inputs: [{ key: "layout.a", label: L }],
  parameters: [{ key: "limit", label: L, dimension: "length", values: { O2: null } }],
  condition: { op: "gte", left: { input: "layout.a" }, right: { param: "limit" } },
  severity: "NO-GO",
  message: L,
  remediation: L,
  source: { document: "x", clause: "TBD-VERIFY" },
  status: "DRAFT",
  verifiedBy: null,
  verifiedAt: null,
  stages: ["9"],
};

describe("rule definition", () => {
  it("accepts a consistent rule", () => {
    expect(ruleSchema.safeParse(base).success).toBe(true);
    expect(ruleIssues(base)).toEqual([]);
  });

  it("detects undeclared, unused and duplicate references", () => {
    const r: Rule = {
      ...base,
      inputs: [{ key: "layout.b", label: L }, { key: "layout.b", label: L }],
      parameters: [base.parameters[0]!, base.parameters[0]!, { ...base.parameters[0]!, key: "other" }],
    };
    expect(ruleIssues(r)).toEqual([
      "duplicate input",
      "duplicate parameter",
      "undeclared input layout.a",
      "unused input layout.b",
      "unused parameter other",
    ]);
    expect(ruleIssues({ ...base, parameters: [] })).toEqual(["undeclared parameter limit"]);
  });

  it("rejects values for non-applicable media and VERIFIED without verifier", () => {
    const r: Rule = { ...base, parameters: [{ ...base.parameters[0]!, values: { O2: null, N2: null } }], status: "VERIFIED" };
    expect(ruleIssues(r)).toEqual([
      "parameter limit has a value for non-applicable medium N2",
      "VERIFIED rule needs verifiedBy and verifiedAt",
    ]);
    expect(ruleSchema.safeParse(r).success).toBe(false);
  });
});

describe("evaluateRule", () => {
  const filled: Rule = { ...base, parameters: [{ ...base.parameters[0]!, values: { O2: quantity(10, "m") } }] };

  it("never returns GO when a parameter is missing", () => {
    expect(evaluateRule(base, "O2", { "layout.a": 999 })).toMatchObject({
      result: "NOT_EVALUATED",
      missingParams: ["limit"],
      params: { limit: null },
      inputs: { "layout.a": 999 },
    });
  });

  it("GO / NO-GO / NOT_EVALUATED with a filled parameter", () => {
    expect(evaluateRule(filled, "O2", { "layout.a": 10 })?.result).toBe("GO");
    expect(evaluateRule(filled, "O2", { "layout.a": 9.99 })?.result).toBe("NO-GO");
    expect(evaluateRule({ ...filled, severity: "WARNING" }, "O2", { "layout.a": 1 })?.result).toBe("WARNING");
    expect(evaluateRule(filled, "O2", {})).toMatchObject({ result: "NOT_EVALUATED", missingInputs: ["layout.a"], inputs: { "layout.a": null } });
  });

  it("returns null for non-applicable media", () => {
    expect(evaluateRule(filled, "N2", {})).toBeNull();
  });

  it("fingerprints are stable and change with inputs or version", () => {
    const a = evaluateRule(filled, "O2", { "layout.a": 10 })!;
    expect(evaluationFingerprint(a)).toBe(evaluationFingerprint({ ...a, inputs: { ...a.inputs } }));
    expect(evaluationFingerprint(a)).not.toBe(evaluationFingerprint({ ...a, inputs: { "layout.a": 11 } }));
    expect(evaluationFingerprint(a)).not.toBe(evaluationFingerprint({ ...a, ruleVersion: 2 }));
  });
});

describe("buildRuleInputs", () => {
  it("flattens design basis, forms (visible only, SI) and sizing/calc", () => {
    const inputs = buildRuleInputs({
      medium: "N2",
      designBasis: {
        medium: "N2",
        questionnaire: "q@1",
        fields: {
          qPeak: { source: "consumption.q_peak", value: 0.2, quantity: quantity(720, "Nm3/h") },
          coolingTowersNearby: { source: "space.cooling_towers", value: true },
          tags: { source: "x.y", value: ["a"] },
        },
      },
      layout: {
        form: LAYOUT_GEOMETRY_FORM,
        answers: { "distances.dist_buildings": quantity(2500, "mm"), "surfaces.surface_under_filling": "asphalt" },
      },
      design: { form: DESIGN_CHECKLIST_FORM, answers: { "control.check_valve_at_tie_in": true } },
      sizing: { capacity_after_icing: 0.3, icing_considered: undefined },
      calc: null,
    });
    expect(inputs).toEqual({
      "db.qPeak": 0.2,
      "db.coolingTowersNearby": true,
      "layout.dist_buildings": 2.5,
      "design.check_valve_at_tie_in": true,
      "sizing.capacity_after_icing": 0.3,
    });
  });

  it("handles missing sources", () => {
    expect(buildRuleInputs({ medium: "O2", designBasis: null, layout: null, design: null })).toEqual({});
  });
});
