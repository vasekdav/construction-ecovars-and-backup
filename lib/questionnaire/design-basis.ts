import type { Quantity } from "@/lib/units";
import type { Medium } from "@/lib/workflow/template";
import { isQuantity, type AnswerValue, type Answers } from "./answers";
import { visibleAnswers } from "./completeness";
import { allQuestions, type QuestionnaireTemplate } from "./template";

/** One Design Basis entry with its provenance (question id). */
export interface DesignBasisField {
  source: string;
  value: Exclude<AnswerValue, Quantity>;
  quantity?: Quantity;
}

export interface DesignBasis {
  medium: Medium;
  questionnaire: string;
  fields: Record<string, DesignBasisField>;
}

/** Structured inputs for sizing and rule checks, filled from the questionnaire (SPEC §5). */
export function buildDesignBasis(tpl: QuestionnaireTemplate, medium: Medium, answers: Answers): DesignBasis {
  const visible = visibleAnswers(tpl, { medium, answers });
  const fields: DesignBasis["fields"] = {};
  for (const q of allQuestions(tpl)) {
    const v = visible[q.id];
    if (!q.designBasis || v === undefined || v === null) continue;
    fields[q.designBasis] = isQuantity(v) ? { source: q.id, value: v.si, quantity: v } : { source: q.id, value: v };
  }
  return { medium, questionnaire: `${tpl.key}@${tpl.version}`, fields };
}
