import { describe, expect, it } from "vitest";
import {
  allQuestions,
  DEFAULT_QUESTIONNAIRE,
  findQuestion,
  getQuestionnaireTemplate,
  questionnaireIssues,
  questionnaireTemplateSchema,
  type Question,
} from "@/lib/questionnaire/template";

const L = { cs: "x", en: "x" };
const q = (over: Partial<Question>): Question => ({ id: "a.b", type: "text", label: L, required: false, phase: "initial", ...over });
const issues = (questions: Question[]) => questionnaireIssues({ sections: [{ id: "s", title: L, questions }] });

describe("default questionnaire", () => {
  it("has the 10 sections of SPEC §5 and is valid", () => {
    expect(DEFAULT_QUESTIONNAIRE.sections.map((s) => s.id)).toEqual([
      "medium",
      "consumption",
      "autonomy",
      "pressure",
      "site",
      "space",
      "tanker",
      "surroundings",
      "utilities",
      "legal",
    ]);
    expect(questionnaireIssues(DEFAULT_QUESTIONNAIRE)).toEqual([]);
    expect(getQuestionnaireTemplate("customer-checklist", 1)).toBe(DEFAULT_QUESTIONNAIRE);
    expect(() => getQuestionnaireTemplate("x", 1)).toThrow();
  });

  it("captures the inputs needed by sizing and rules in SI-ready quantities", () => {
    for (const id of ["consumption.q_avg", "consumption.q_peak", "autonomy.required", "pressure.required", "site.temp_min"]) {
      const question = findQuestion(DEFAULT_QUESTIONNAIRE, id);
      expect(question?.type).toBe("quantity");
      expect(question?.required).toBe(true);
    }
    expect(findQuestion(DEFAULT_QUESTIONNAIRE, "nope")).toBeUndefined();
  });

  it("has medium-specific questions for N₂ and O₂", () => {
    expect(findQuestion(DEFAULT_QUESTIONNAIRE, "surroundings.confined_spaces")?.showIf?.medium).toEqual(["N2"]);
    expect(findQuestion(DEFAULT_QUESTIONNAIRE, "surroundings.flammables")?.showIf?.medium).toEqual(["O2"]);
  });

  it("contains no default answers or engineering limits", () => {
    for (const question of allQuestions(DEFAULT_QUESTIONNAIRE)) {
      expect(question).not.toHaveProperty("default");
      if (question.min !== undefined || question.max !== undefined) expect(question.id).toMatch(/^site\.(latitude|longitude)$/);
    }
  });
});

describe("questionnaire validation", () => {
  it("detects duplicates", () => {
    expect(issues([q({}), q({})])).toContain("duplicate question a.b");
    expect(
      questionnaireIssues({
        sections: [
          { id: "s", title: L, questions: [q({ id: "a.x", designBasis: "k" })] },
          { id: "s", title: L, questions: [q({ id: "a.y", designBasis: "k" })] },
        ],
      }),
    ).toEqual(["duplicate section s", "duplicate designBasis key k"]);
  });

  it("checks quantity units", () => {
    expect(issues([q({ type: "quantity" })])).toEqual(["a.b: quantity needs dimension, units, defaultUnit"]);
    expect(issues([q({ type: "quantity", dimension: "length", units: ["m", "h"], defaultUnit: "mm" })])).toEqual([
      "a.b: unit h is not length",
      "a.b: defaultUnit not in units",
    ]);
    expect(issues([q({ units: ["m"] })])).toEqual(["a.b: only quantity questions have units"]);
  });

  it("checks options and ranges", () => {
    expect(issues([q({ type: "select" })])).toEqual(["a.b: select needs options"]);
    expect(issues([q({ options: [{ value: "x", label: L }] })])).toEqual(["a.b: only select questions have options"]);
    expect(
      issues([q({ type: "select", options: [{ value: "x", label: L }, { value: "x", label: L }] })]),
    ).toEqual(["a.b: duplicate option values"]);
    expect(issues([q({ min: 1 })])).toEqual(["a.b: min/max only for number"]);
    expect(issues([q({ type: "number", min: 2, max: 1 })])).toEqual(["a.b: min > max"]);
  });

  it("checks showIf references", () => {
    expect(issues([q({ showIf: { answer: { question: "x.y", equals: true } } })])).toEqual([
      "a.b: showIf references unknown question x.y",
    ]);
    expect(issues([q({ showIf: { answer: { question: "a.b", equals: true } } })])).toEqual(["a.b: showIf references itself"]);
    expect(
      issues([
        q({ id: "a.c", showIf: { medium: ["O2"], answer: { question: "a.d", equals: true } } }),
        q({ id: "a.d", type: "boolean", showIf: { answer: { question: "a.e", equals: true } } }),
        q({ id: "a.e", type: "boolean" }),
      ]),
    ).toEqual(["a.c: showIf chains are not supported (a.d is conditional)"]);
  });

  it("schema rejects malformed showIf and unknown units", () => {
    const base = { key: "k", version: 1, title: L };
    const bad = (question: unknown) =>
      questionnaireTemplateSchema.safeParse({ ...base, sections: [{ id: "s", title: L, questions: [question] }] }).success;
    expect(bad({ ...q({}), showIf: {} })).toBe(false);
    expect(bad({ ...q({}), showIf: { answer: { question: "x.y" } } })).toBe(false);
    expect(bad({ ...q({ type: "quantity", dimension: "length", defaultUnit: "m" }), units: ["furlong"] })).toBe(false);
    expect(bad(q({}))).toBe(true);
  });
});
