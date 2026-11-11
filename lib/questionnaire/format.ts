import { formatNumber, unitLabel } from "@/lib/units";
import { isQuantity, type AnswerValue } from "./answers";
import type { Question } from "./template";

/** Human-readable answer in the unit it was entered in. */
export function formatAnswer(q: Question, v: AnswerValue | null | undefined, locale: "cs" | "en"): string {
  if (v === null || v === undefined) return "—";
  const nf = locale === "cs" ? "cs-CZ" : "en-GB";
  if (isQuantity(v)) return `${formatNumber(v.input, 6, nf)} ${unitLabel(v.inputUnit)}`;
  if (typeof v === "boolean") return locale === "cs" ? (v ? "ano" : "ne") : v ? "yes" : "no";
  if (typeof v === "number") return formatNumber(v, 6, nf);
  if (Array.isArray(v)) return v.map((x) => q.options?.find((o) => o.value === x)?.label[locale] ?? x).join(", ");
  return q.options?.find((o) => o.value === v)?.label[locale] ?? v;
}
