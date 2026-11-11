import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadRuleFiles } from "@/lib/rules/catalog";
import { displayInput, INPUT_CATALOG } from "@/lib/safety/input-catalog";

describe("rule catalog", () => {
  it("rejects an invalid rule file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rules-"));
    writeFileSync(path.join(dir, "R-BAD-01.json"), JSON.stringify({ id: "nope" }));
    writeFileSync(path.join(dir, "readme.txt"), "ignored");
    expect(() => loadRuleFiles(dir)).toThrow(/Invalid rule file R-BAD-01.json/);
  });
});

describe("input catalog", () => {
  it("knows every source of rule inputs", () => {
    expect(INPUT_CATALOG["db.qPeak"]).toMatchObject({ where: "questionnaire", unit: "Nm3/h" });
    expect(INPUT_CATALOG["layout.dist_buildings"]).toMatchObject({ where: "layout", unit: "m" });
    expect(INPUT_CATALOG["design.check_valve_at_tie_in"]?.where).toBe("design-inputs");
    expect(INPUT_CATALOG["calc.autonomy"]?.where).toBe("sizing");
  });

  it("displays SI values in the form's unit", () => {
    expect(displayInput("db.qPeak", 0.2, "en")).toBe("720 Nm³/h");
    expect(displayInput("db.qPeak", 0.2, "cs")).toBe("720 Nm³/h");
    expect(displayInput("calc.autonomy", 5400, "cs")).toBe("1,5 h");
    expect(displayInput("design.check_valve_at_tie_in", true, "cs")).toBe("ano");
    expect(displayInput("design.check_valve_at_tie_in", false, "en")).toBe("no");
    expect(displayInput("layout.surface_under_filling", "concrete", "cs")).toBe("concrete");
    expect(displayInput("x.y", null, "cs")).toBe("—");
  });
});
