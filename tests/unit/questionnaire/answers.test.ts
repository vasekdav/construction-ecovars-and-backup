import { describe, expect, it } from "vitest";
import { isAnswered, isQuantity, parseAnswer, parseLocaleNumber } from "@/lib/questionnaire/answers";
import type { Question } from "@/lib/questionnaire/template";

const L = { cs: "x", en: "x" };
const q = (over: Partial<Question>): Question => ({ id: "a.b", type: "text", label: L, required: true, phase: "initial", ...over });

describe("parseLocaleNumber", () => {
  it.each([
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["1 234,5", 1234.5],
    ["-40", -40],
    ["1e3", 1000],
    [7, 7],
    ["abc", null],
    ["1,2,3", null],
    ["", null],
    [Number.NaN, null],
    [{}, null],
  ])("%s → %s", (raw, expected) => {
    expect(parseLocaleNumber(raw)).toBe(expected);
  });
});

describe("parseAnswer", () => {
  it("text and textarea", () => {
    expect(parseAnswer(q({}), "  ahoj ")).toEqual({ ok: true, value: "ahoj" });
    expect(parseAnswer(q({}), "   ")).toEqual({ ok: true, value: null });
    expect(parseAnswer(q({}), "x".repeat(501))).toEqual({ ok: false, error: "too_long" });
    expect(parseAnswer(q({ type: "textarea" }), "x".repeat(501)).ok).toBe(true);
    expect(parseAnswer(q({ type: "textarea" }), "x".repeat(4001))).toEqual({ ok: false, error: "too_long" });
  });

  it("number with range", () => {
    const lat = q({ type: "number", min: -90, max: 90 });
    expect(parseAnswer(lat, "50,08")).toEqual({ ok: true, value: 50.08 });
    expect(parseAnswer(lat, "91")).toEqual({ ok: false, error: "out_of_range" });
    expect(parseAnswer(lat, "-91")).toEqual({ ok: false, error: "out_of_range" });
    expect(parseAnswer(lat, "x")).toEqual({ ok: false, error: "invalid_number" });
    expect(parseAnswer(lat, "")).toEqual({ ok: true, value: null });
  });

  it("quantity converts to SI and keeps the input unit", () => {
    const flow = q({ type: "quantity", dimension: "normal_volume_flow", units: ["Nm3/h", "Nm3/min"], defaultUnit: "Nm3/h", nonNegative: true });
    const r = parseAnswer(flow, { input: "360", unit: "Nm3/h" });
    expect(r).toEqual({ ok: true, value: { si: 0.1, siUnit: "Nm3/s", input: 360, inputUnit: "Nm3/h" } });
    expect(parseAnswer(flow, { input: "6", unit: "" })).toMatchObject({ ok: true, value: { inputUnit: "Nm3/h" } });
    expect(parseAnswer(flow, { input: "6", unit: "bar(g)" })).toEqual({ ok: false, error: "invalid_unit" });
    expect(parseAnswer(flow, { input: "-1", unit: "Nm3/h" })).toEqual({ ok: false, error: "negative" });
    expect(parseAnswer(flow, { input: "x", unit: "Nm3/h" })).toEqual({ ok: false, error: "invalid_number" });
    expect(parseAnswer(flow, { input: "", unit: "Nm3/h" })).toEqual({ ok: true, value: null });
    expect(parseAnswer(flow, undefined)).toEqual({ ok: true, value: null });
  });

  it("temperature may be negative but not below absolute zero", () => {
    const t = q({ type: "quantity", dimension: "temperature", units: ["°C", "K"], defaultUnit: "°C" });
    expect(parseAnswer(t, { input: "-25", unit: "°C" }).ok).toBe(true);
    expect(parseAnswer(t, { input: "-300", unit: "°C" })).toEqual({ ok: false, error: "below_absolute_zero" });
  });

  it("select and multiselect", () => {
    const options = [
      { value: "a", label: L },
      { value: "b", label: L },
    ];
    expect(parseAnswer(q({ type: "select", options }), "a")).toEqual({ ok: true, value: "a" });
    expect(parseAnswer(q({ type: "select", options }), "z")).toEqual({ ok: false, error: "invalid_option" });
    expect(parseAnswer(q({ type: "select", options }), "")).toEqual({ ok: true, value: null });
    expect(parseAnswer(q({ type: "multiselect", options }), ["a", "b", "a"])).toEqual({ ok: true, value: ["a", "b"] });
    expect(parseAnswer(q({ type: "multiselect", options }), "b")).toEqual({ ok: true, value: ["b"] });
    expect(parseAnswer(q({ type: "multiselect", options }), ["z"])).toEqual({ ok: false, error: "invalid_option" });
    expect(parseAnswer(q({ type: "multiselect", options }), [])).toEqual({ ok: true, value: null });
  });

  it("boolean and date", () => {
    const b = q({ type: "boolean" });
    expect(parseAnswer(b, "true")).toEqual({ ok: true, value: true });
    expect(parseAnswer(b, false)).toEqual({ ok: true, value: false });
    expect(parseAnswer(b, "")).toEqual({ ok: true, value: null });
    expect(parseAnswer(b, "maybe")).toEqual({ ok: false, error: "invalid_boolean" });
    const d = q({ type: "date" });
    expect(parseAnswer(d, "2026-02-28")).toEqual({ ok: true, value: "2026-02-28" });
    expect(parseAnswer(d, "2026-02-30")).toEqual({ ok: false, error: "invalid_date" });
    expect(parseAnswer(d, "28.2.2026")).toEqual({ ok: false, error: "invalid_date" });
    expect(parseAnswer(d, null)).toEqual({ ok: true, value: null });
  });

  it("isAnswered / isQuantity", () => {
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered(" ")).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(false)).toBe(true);
    expect(isAnswered(0)).toBe(true);
    expect(isQuantity({ si: 1, siUnit: "m", input: 1, inputUnit: "m" })).toBe(true);
    expect(isQuantity("x")).toBe(false);
    expect(isQuantity(null)).toBe(false);
  });
});
