import { describe, expect, it } from "vitest";
import {
  appliesToMedium,
  DEFAULT_TEMPLATE,
  documentKindTitle,
  getTemplate,
  processTemplateSchema,
  stageTemplate,
  templateIssues,
  type ProcessTemplate,
} from "@/lib/workflow/template";

const clone = (): ProcessTemplate => structuredClone(DEFAULT_TEMPLATE);

describe("default process template", () => {
  it("has steps 1 to 10 numbered unchanged (SPEC §3)", () => {
    const numbered = DEFAULT_TEMPLATE.stages.filter((s) => !s.optional).map((s) => s.number);
    expect(numbered.sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("encodes the approved dependency graph 1 → 2 → {4,5,7} → 8 → {3,9} → 6 → 10", () => {
    const deps = (k: string) => stageTemplate(DEFAULT_TEMPLATE, k).dependsOn;
    expect(deps("1")).toEqual([]);
    expect(deps("2")).toEqual(["1"]);
    for (const k of ["4", "5", "7"]) expect(deps(k)).toEqual(["2"]);
    expect(deps("8")).toEqual(["4", "5", "7"]);
    for (const k of ["3", "9"]) expect(deps(k)).toEqual(["8"]);
    expect(deps("6")).toEqual(["3", "9"]);
    expect(deps("10").filter((d) => /^\d+$/.test(d))).toEqual(["6"]);
  });

  it("optional steps are disabled by default and have no number", () => {
    const optional = DEFAULT_TEMPLATE.stages.filter((s) => s.optional).map((s) => s.key);
    expect(optional).toEqual(["H1", "C1", "P1", "F1", "O1"]);
  });

  it("validates without issues", () => {
    expect(templateIssues(DEFAULT_TEMPLATE)).toEqual([]);
    expect(getTemplate(DEFAULT_TEMPLATE.key, DEFAULT_TEMPLATE.version)).toBe(DEFAULT_TEMPLATE);
    expect(() => getTemplate("nope", 1)).toThrow();
    expect(() => stageTemplate(DEFAULT_TEMPLATE, "99")).toThrow();
  });

  it("filters media-specific steps", () => {
    const c1 = stageTemplate(DEFAULT_TEMPLATE, "C1");
    expect(appliesToMedium(c1, "O2")).toBe(true);
    expect(appliesToMedium(c1, "N2")).toBe(false);
    expect(appliesToMedium(stageTemplate(DEFAULT_TEMPLATE, "1"), "N2")).toBe(true);
  });

  it("resolves document kind titles", () => {
    expect(documentKindTitle(DEFAULT_TEMPLATE, "pid_dwg", "cs")).toBe("P&ID v DWG");
    expect(documentKindTitle(DEFAULT_TEMPLATE, "unknown", "en")).toBe("unknown");
  });
});

describe("template validation", () => {
  it("detects a dependency cycle", () => {
    const t = clone();
    stageTemplate(t, "1").dependsOn = ["10"];
    expect(templateIssues(t).some((i) => i.startsWith("dependency cycle"))).toBe(true);
    expect(processTemplateSchema.safeParse(t).success).toBe(false);
  });

  it("detects unknown and self references", () => {
    const t = clone();
    stageTemplate(t, "2").dependsOn = ["2", "42"];
    const issues = templateIssues(t);
    expect(issues).toContain("stage 2 depends on itself");
    expect(issues).toContain("stage 2 depends on unknown stage 42");
  });

  it("detects duplicate keys, numbers and gate ids, wrong numbering and unknown kinds", () => {
    const t = clone();
    t.stages.push({ ...structuredClone(stageTemplate(t, "1")) });
    const s3 = stageTemplate(t, "3");
    s3.number = 2;
    const s2 = stageTemplate(t, "2");
    s2.gate.push(structuredClone(s2.gate[0]!));
    const s4 = stageTemplate(t, "4");
    s4.gate.push({ id: "x", type: "documentLinks", kinds: ["nope"], requireVersion: false, requireDate: false });
    const issues = templateIssues(t);
    expect(issues).toContain("duplicate stage key 1");
    expect(issues).toContain("duplicate stage number 2");
    expect(issues).toContain("stage 3 key must equal its number");
    expect(issues).toContain("duplicate gate id pid_references in stage 2");
    expect(issues).toContain("unknown document kind nope in stage 4");
  });

  it("checks numbering of optional and mandatory steps and layout gates", () => {
    const t = clone();
    stageTemplate(t, "H1").number = 3;
    delete stageTemplate(t, "5").number;
    stageTemplate(t, "9").layout = "concept";
    const issues = templateIssues(t);
    expect(issues).toContain("optional stage H1 must not have a number");
    expect(issues).toContain("stage 5 needs a number");
    expect(issues).toContain("stage 9 gate expects layout final");
  });
});
