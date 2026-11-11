import { describe, expect, it } from "vitest";
import type { Answers } from "@/lib/questionnaire/answers";
import { completeness, isVisible } from "@/lib/questionnaire/completeness";
import { buildDesignBasis } from "@/lib/questionnaire/design-basis";
import { allQuestions, DEFAULT_QUESTIONNAIRE, findQuestion, type Question } from "@/lib/questionnaire/template";
import { quantity } from "@/lib/units";

const T = DEFAULT_QUESTIONNAIRE;
const Q = (id: string) => findQuestion(T, id)!;
const L = { cs: "x", en: "x" };

/** Answers every required visible question of the given phase with a plausible fictitious value. */
function fill(phase: "initial" | "detailed", medium: "O2" | "N2", extra: Answers = {}): Answers {
  const answers: Answers = { ...extra };
  for (let pass = 0; pass < 2; pass++) {
    for (const q of allQuestions(T)) {
      if (!q.required || answers[q.id] !== undefined) continue;
      if (phase === "initial" && q.phase !== "initial") continue;
      if (!isVisible(q, { medium, answers })) continue;
      answers[q.id] =
        q.type === "quantity"
          ? quantity(1, q.defaultUnit!)
          : q.type === "boolean"
            ? true
            : q.type === "select"
              ? q.options![0]!.value
              : q.type === "number"
                ? 0
                : "demo";
    }
  }
  return answers;
}

describe("isVisible", () => {
  it("filters by medium (SPEC §5: N₂ questions are hidden for O₂ projects)", () => {
    expect(isVisible(Q("surroundings.confined_spaces"), { medium: "O2", answers: {} })).toBe(false);
    expect(isVisible(Q("surroundings.confined_spaces"), { medium: "N2", answers: {} })).toBe(true);
    expect(isVisible(Q("surroundings.flammables"), { medium: "N2", answers: {} })).toBe(false);
  });

  it("filters by another answer (equals / notIn / in)", () => {
    const detail = Q("space.cooling_towers_detail");
    expect(isVisible(detail, { medium: "O2", answers: {} })).toBe(false);
    expect(isVisible(detail, { medium: "O2", answers: { "space.cooling_towers": false } })).toBe(false);
    expect(isVisible(detail, { medium: "O2", answers: { "space.cooling_towers": true } })).toBe(true);
    const src = Q("pressure.source_pressure");
    expect(isVisible(src, { medium: "O2", answers: {} })).toBe(false);
    expect(isVisible(src, { medium: "O2", answers: { "pressure.source_type": "none" } })).toBe(false);
    expect(isVisible(src, { medium: "O2", answers: { "pressure.source_type": "asu" } })).toBe(true);
    const custom: Question = {
      id: "a.b",
      type: "text",
      label: L,
      required: true,
      phase: "initial",
      showIf: { answer: { question: "x.y", in: ["a"] } },
    };
    expect(isVisible(custom, { medium: "O2", answers: { "x.y": "a" } })).toBe(true);
    expect(isVisible(custom, { medium: "O2", answers: { "x.y": "b" } })).toBe(false);
  });
});

describe("completeness", () => {
  it("is 0 % for an empty questionnaire and lists missing items", () => {
    const c = completeness(T, { medium: "O2", answers: {} }, "initial");
    expect(c.percent).toBe(0);
    expect(c.answered).toBe(0);
    expect(c.missing).toContain("consumption.q_peak");
    expect(c.missing).not.toContain("site.temp_min");
  });

  it("initial phase counts only initial questions; detailed counts all", () => {
    const initial = fill("initial", "O2");
    expect(completeness(T, { medium: "O2", answers: initial }, "initial").percent).toBe(100);
    const detailed = completeness(T, { medium: "O2", answers: initial }, "detailed");
    expect(detailed.percent).toBeLessThan(100);
    expect(detailed.missing).toContain("site.temp_min");
    expect(completeness(T, { medium: "O2", answers: fill("detailed", "O2") }, "detailed")).toMatchObject({
      percent: 100,
      missing: [],
    });
  });

  it("conditional required questions count only when visible", () => {
    const answers = fill("detailed", "N2", { "space.cooling_towers": false, "surroundings.low_points": false });
    const c = completeness(T, { medium: "N2", answers }, "detailed");
    expect(c.percent).toBe(100);
    expect(answers["surroundings.confined_spaces"]).toBeDefined();
    expect(answers["surroundings.flammables"]).toBeUndefined();
    const withTowers = { ...answers, "space.cooling_towers": true };
    expect(completeness(T, { medium: "N2", answers: withTowers }, "detailed").missing).toEqual(["space.cooling_towers_detail"]);
  });

  it("reports per-section progress and 100 % when nothing is required", () => {
    const c = completeness(T, { medium: "O2", answers: {} }, "initial");
    expect(c.bySection.consumption).toEqual({ total: 4, answered: 0 });
    expect(c.bySection.legal).toEqual({ total: 0, answered: 0 });
    const none = completeness({ ...T, sections: [{ id: "s", title: L, questions: [{ ...Q("legal.insurer") }] }] }, { medium: "O2", answers: {} }, "detailed");
    expect(none.percent).toBe(100);
  });
});

describe("buildDesignBasis", () => {
  it("maps visible answers to keys with provenance and SI values", () => {
    const answers: Answers = {
      "consumption.q_peak": quantity(720, "Nm3/h"),
      "medium.application": "process",
      "space.cooling_towers": true,
      "surroundings.confined_spaces": "hidden for O2",
      "medium.application_detail": "no designBasis key",
    };
    const db = buildDesignBasis(T, "O2", answers);
    expect(db.medium).toBe("O2");
    expect(db.questionnaire).toBe("customer-checklist@1");
    expect(db.fields.qPeak).toEqual({ source: "consumption.q_peak", value: 0.2, quantity: quantity(720, "Nm3/h") });
    expect(db.fields.applicationType).toEqual({ source: "medium.application", value: "process" });
    expect(db.fields.coolingTowersNearby?.value).toBe(true);
    expect(db.fields.confinedSpaces).toBeUndefined();
    expect(Object.keys(db.fields)).toHaveLength(3);
  });
});
