import { describe, expect, it } from "vitest";
import { stageRuleStatus } from "@/lib/safety/project";

type Ev = Parameters<typeof stageRuleStatus>[0];
const result = (ruleId: string, stages: string[]) => ({ ruleId, rule: { stages } }) as unknown as NonNullable<Ev>["results"][number];

describe("stageRuleStatus (gate safety)", () => {
  it("returns null without an evaluation or with an empty rule catalogue", () => {
    expect(stageRuleStatus(null, "4")).toBeNull();
    expect(stageRuleStatus({ results: [], byStage: {} }, "4")).toBeNull();
  });

  it("returns null when no applicable rule is mapped to the step", () => {
    expect(stageRuleStatus({ results: [result("R-A", ["9"])], byStage: { "9": { noGo: [], notEvaluated: [] } } }, "4")).toBeNull();
  });

  it("returns the step status when rules are mapped", () => {
    expect(
      stageRuleStatus({ results: [result("R-A", ["4"])], byStage: { "4": { noGo: ["R-A"], notEvaluated: [] } } }, "4"),
    ).toEqual({ noGo: ["R-A"], notEvaluated: [] });
    expect(stageRuleStatus({ results: [result("R-A", ["4"])], byStage: {} }, "4")).toEqual({ noGo: [], notEvaluated: [] });
  });
});
