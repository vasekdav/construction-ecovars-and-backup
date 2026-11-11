import { isQuantity, type Answers } from "@/lib/questionnaire/answers";
import { visibleAnswers } from "@/lib/questionnaire/completeness";
import type { DesignBasis } from "@/lib/questionnaire/design-basis";
import type { QuestionnaireTemplate } from "@/lib/questionnaire/template";
import type { Medium } from "@/lib/workflow/template";
import type { Primitive } from "./expr";

/**
 * Flat rule inputs (all numbers in SI):
 *   db.<key>      Design Basis (customer questionnaire)
 *   layout.<name> geometry of the latest layout version
 *   design.<name> design checklist (P&ID / equipment)
 *   sizing.<key>  imported sizing result (phase 4)
 *   calc.<key>    calculations (phase 4)
 */
export interface RuleInputSources {
  medium: Medium;
  designBasis: DesignBasis | null;
  layout: { form: QuestionnaireTemplate; answers: Answers } | null;
  design: { form: QuestionnaireTemplate; answers: Answers } | null;
  sizing?: Record<string, Primitive | undefined> | null;
  calc?: Record<string, Primitive | undefined> | null;
}

function fromForm(prefix: string, src: { form: QuestionnaireTemplate; answers: Answers }, medium: Medium) {
  const out: Record<string, Primitive> = {};
  const visible = visibleAnswers(src.form, { medium, answers: src.answers });
  for (const [id, v] of Object.entries(visible)) {
    if (v === null || v === undefined || Array.isArray(v)) continue;
    const name = id.slice(id.indexOf(".") + 1);
    out[`${prefix}.${name}`] = isQuantity(v) ? v.si : v;
  }
  return out;
}

export function buildRuleInputs(src: RuleInputSources): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  if (src.designBasis) {
    for (const [k, f] of Object.entries(src.designBasis.fields)) {
      if (!Array.isArray(f.value)) out[`db.${k}`] = f.value;
    }
  }
  if (src.layout) Object.assign(out, fromForm("layout", src.layout, src.medium));
  if (src.design) Object.assign(out, fromForm("design", src.design, src.medium));
  for (const [prefix, rec] of [
    ["sizing", src.sizing],
    ["calc", src.calc],
  ] as const) {
    for (const [k, v] of Object.entries(rec ?? {})) if (v !== undefined) out[`${prefix}.${k}`] = v;
  }
  return out;
}
