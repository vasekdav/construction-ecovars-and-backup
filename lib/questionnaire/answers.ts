import { isPhysicallyValid, isUnit, quantity, type Quantity } from "@/lib/units";
import type { Question } from "./template";

/** Normalised stored answer. Quantities keep SI value + input value + input unit. */
export type AnswerValue = string | number | boolean | string[] | Quantity;
export type Answers = Record<string, AnswerValue | null | undefined>;

export type AnswerError =
  | "invalid_number"
  | "out_of_range"
  | "negative"
  | "invalid_unit"
  | "invalid_option"
  | "too_long"
  | "invalid_boolean"
  | "invalid_date"
  | "below_absolute_zero";

export type ParseResult = { ok: true; value: AnswerValue | null } | { ok: false; error: AnswerError };

const MAX_TEXT = 500;
const MAX_TEXTAREA = 4000;

/** Accepts "12.5", "12,5" and "1 234,5". */
export function parseLocaleNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/[\s ]/g, "").replace(",", ".");
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isEmpty(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "") || (Array.isArray(raw) && raw.length === 0);
}

/**
 * Parse a raw form value for a question. Empty input clears the answer (null).
 * Quantities expect `{ input, unit }`.
 */
export function parseAnswer(q: Question, raw: unknown): ParseResult {
  switch (q.type) {
    case "text":
    case "textarea": {
      if (isEmpty(raw)) return { ok: true, value: null };
      const s = String(raw).trim();
      return s.length > (q.type === "text" ? MAX_TEXT : MAX_TEXTAREA) ? { ok: false, error: "too_long" } : { ok: true, value: s };
    }
    case "number": {
      if (isEmpty(raw)) return { ok: true, value: null };
      const n = parseLocaleNumber(raw);
      if (n === null) return { ok: false, error: "invalid_number" };
      if ((q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) return { ok: false, error: "out_of_range" };
      return { ok: true, value: n };
    }
    case "quantity": {
      const r = (raw ?? {}) as { input?: unknown; unit?: unknown };
      if (isEmpty(r.input)) return { ok: true, value: null };
      const n = parseLocaleNumber(r.input);
      if (n === null) return { ok: false, error: "invalid_number" };
      const unit = isEmpty(r.unit) ? q.defaultUnit : r.unit;
      if (!isUnit(unit) || !q.units?.includes(unit)) return { ok: false, error: "invalid_unit" };
      if (q.nonNegative && n < 0) return { ok: false, error: "negative" };
      const value = quantity(n, unit);
      if (!isPhysicallyValid(value)) return { ok: false, error: "below_absolute_zero" };
      return { ok: true, value };
    }
    case "select": {
      if (isEmpty(raw)) return { ok: true, value: null };
      const v = String(raw);
      return q.options?.some((o) => o.value === v) ? { ok: true, value: v } : { ok: false, error: "invalid_option" };
    }
    case "multiselect": {
      if (isEmpty(raw)) return { ok: true, value: null };
      const values = (Array.isArray(raw) ? raw : [raw]).map(String);
      if (!values.every((v) => q.options?.some((o) => o.value === v))) return { ok: false, error: "invalid_option" };
      return { ok: true, value: [...new Set(values)] };
    }
    case "boolean": {
      if (isEmpty(raw)) return { ok: true, value: null };
      if (raw === true || raw === "true") return { ok: true, value: true };
      if (raw === false || raw === "false") return { ok: true, value: false };
      return { ok: false, error: "invalid_boolean" };
    }
    case "date": {
      if (isEmpty(raw)) return { ok: true, value: null };
      const s = String(raw);
      const d = new Date(`${s}T00:00:00Z`);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s)
        ? { ok: true, value: s }
        : { ok: false, error: "invalid_date" };
    }
  }
}

export function isQuantity(v: unknown): v is Quantity {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "si" in v && "inputUnit" in v;
}

export function isAnswered(v: AnswerValue | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
