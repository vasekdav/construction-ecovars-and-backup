import { DESIGN_CHECKLIST_FORM, LAYOUT_GEOMETRY_FORM } from "@/lib/forms";
import { allQuestions, DEFAULT_QUESTIONNAIRE } from "@/lib/questionnaire/template";
import { formatNumber, fromSI, unitLabel, type UnitId } from "@/lib/units";
import type { Localized } from "@/lib/workflow/template";

export interface InputInfo {
  label: Localized;
  unit?: UnitId;
  /** Link target inside a project (relative). */
  where: "questionnaire" | "design-inputs" | "layout" | "sizing";
}

const SIZING: Record<string, InputInfo> = {
  "sizing.capacity_after_icing": { label: { cs: "Kapacita po námraze (sizing)", en: "Capacity after icing (sizing)" }, unit: "Nm3/h", where: "sizing" },
  "sizing.design_ambient_min_temp": { label: { cs: "Min. teplota v sizingu", en: "Minimum temperature in sizing" }, unit: "°C", where: "sizing" },
  "sizing.icing_considered": { label: { cs: "Námraza zohledněna", en: "Icing considered" }, where: "sizing" },
  "calc.autonomy": { label: { cs: "Vypočtená autonomie", en: "Calculated autonomy" }, unit: "h", where: "sizing" },
};

/** Where each rule input comes from and how to display it. */
export const INPUT_CATALOG: Record<string, InputInfo> = (() => {
  const out: Record<string, InputInfo> = { ...SIZING };
  const add = (prefix: string, form: typeof LAYOUT_GEOMETRY_FORM, where: InputInfo["where"]) => {
    for (const q of allQuestions(form)) {
      out[`${prefix}.${q.id.slice(q.id.indexOf(".") + 1)}`] = { label: q.label, unit: q.defaultUnit, where };
    }
  };
  add("layout", LAYOUT_GEOMETRY_FORM, "layout");
  add("design", DESIGN_CHECKLIST_FORM, "design-inputs");
  for (const q of allQuestions(DEFAULT_QUESTIONNAIRE)) {
    if (q.designBasis) out[`db.${q.designBasis}`] = { label: q.label, unit: q.defaultUnit, where: "questionnaire" };
  }
  return out;
})();

/** Display an SI input value in the unit the form uses by default. */
export function displayInput(key: string, value: number | string | boolean | null, locale: "cs" | "en"): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return locale === "cs" ? (value ? "ano" : "ne") : value ? "yes" : "no";
  const unit = INPUT_CATALOG[key]?.unit;
  if (typeof value === "number" && unit) {
    return `${formatNumber(fromSI(value, unit), 3, locale === "cs" ? "cs-CZ" : "en-GB")} ${unitLabel(unit)}`;
  }
  return String(value);
}
