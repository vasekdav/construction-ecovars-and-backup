import { z } from "zod";
import defaultJson from "@/data/questionnaire/default.json";
import { DIMENSIONS, dimensionOf, isUnit, type UnitId } from "@/lib/units";
import { MEDIA } from "@/lib/workflow/template";

/** Customer questionnaire template (SPEC §5): versioned JSON, not hard-wired forms. Pure module. */

const localized = z.object({ cs: z.string().min(1), en: z.string().min(1) });

export const QUESTION_TYPES = ["text", "textarea", "number", "quantity", "select", "multiselect", "boolean", "date"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const PHASES = ["initial", "detailed"] as const;
export type QuestionnairePhase = (typeof PHASES)[number];

const unitId = z.string().refine(isUnit, { message: "unknown unit" }).transform((u) => u as UnitId);

const showIfSchema = z
  .object({
    medium: z.array(z.enum(MEDIA)).min(1).optional(),
    answer: z
      .object({
        question: z.string(),
        equals: z.union([z.string(), z.boolean()]).optional(),
        in: z.array(z.string()).min(1).optional(),
        notIn: z.array(z.string()).min(1).optional(),
      })
      .refine((a) => [a.equals, a.in, a.notIn].filter((v) => v !== undefined).length === 1, {
        message: "answer condition needs exactly one of equals / in / notIn",
      })
      .optional(),
  })
  .refine((s) => s.medium || s.answer, { message: "empty showIf" });
export type ShowIf = z.infer<typeof showIfSchema>;

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/),
  type: z.enum(QUESTION_TYPES),
  label: localized,
  help: localized.optional(),
  required: z.boolean(),
  phase: z.enum(PHASES),
  dimension: z.enum(DIMENSIONS).optional(),
  units: z.array(unitId).min(1).optional(),
  defaultUnit: unitId.optional(),
  nonNegative: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.object({ value: z.string().min(1), label: localized })).min(1).optional(),
  showIf: showIfSchema.optional(),
  /** Target field in DesignBasis. */
  designBasis: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/).optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const sectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: localized,
  questions: z.array(questionSchema).min(1),
});
export type Section = z.infer<typeof sectionSchema>;

export const questionnaireTemplateSchema = z
  .object({
    key: z.string().min(1),
    version: z.number().int().min(1),
    title: localized,
    sections: z.array(sectionSchema).min(1),
  })
  .superRefine((tpl, ctx) => {
    for (const issue of questionnaireIssues(tpl)) ctx.addIssue({ code: "custom", message: issue });
  });
export type QuestionnaireTemplate = z.infer<typeof questionnaireTemplateSchema>;

export function allQuestions(tpl: Pick<QuestionnaireTemplate, "sections">): Question[] {
  return tpl.sections.flatMap((s) => s.questions);
}

export function questionnaireIssues(tpl: Pick<QuestionnaireTemplate, "sections">): string[] {
  const issues: string[] = [];
  const sectionIds = new Set<string>();
  const ids = new Map<string, Question>();
  const dbKeys = new Set<string>();
  for (const s of tpl.sections) {
    if (sectionIds.has(s.id)) issues.push(`duplicate section ${s.id}`);
    sectionIds.add(s.id);
    for (const q of s.questions) {
      if (ids.has(q.id)) issues.push(`duplicate question ${q.id}`);
      ids.set(q.id, q);
      if (q.designBasis) {
        if (dbKeys.has(q.designBasis)) issues.push(`duplicate designBasis key ${q.designBasis}`);
        dbKeys.add(q.designBasis);
      }
      const isQuantity = q.type === "quantity";
      if (isQuantity) {
        if (!q.dimension || !q.units || !q.defaultUnit) issues.push(`${q.id}: quantity needs dimension, units, defaultUnit`);
        else {
          for (const u of q.units) {
            if (!isUnit(u)) issues.push(`${q.id}: unknown unit ${String(u)}`);
            else if (dimensionOf(u) !== q.dimension) issues.push(`${q.id}: unit ${u} is not ${q.dimension}`);
          }
          if (!q.units.includes(q.defaultUnit)) issues.push(`${q.id}: defaultUnit not in units`);
        }
      } else if (q.dimension || q.units || q.defaultUnit) {
        issues.push(`${q.id}: only quantity questions have units`);
      }
      const hasOptions = q.type === "select" || q.type === "multiselect";
      if (hasOptions && !q.options) issues.push(`${q.id}: ${q.type} needs options`);
      if (!hasOptions && q.options) issues.push(`${q.id}: only select questions have options`);
      if (q.options && new Set(q.options.map((o) => o.value)).size !== q.options.length) {
        issues.push(`${q.id}: duplicate option values`);
      }
      if ((q.min !== undefined || q.max !== undefined) && q.type !== "number") issues.push(`${q.id}: min/max only for number`);
      if (q.min !== undefined && q.max !== undefined && q.min > q.max) issues.push(`${q.id}: min > max`);
    }
  }
  for (const q of ids.values()) {
    const ref = q.showIf?.answer?.question;
    if (ref === undefined) continue;
    const target = ids.get(ref);
    if (!target) issues.push(`${q.id}: showIf references unknown question ${ref}`);
    else if (ref === q.id) issues.push(`${q.id}: showIf references itself`);
    else if (target.showIf?.answer) issues.push(`${q.id}: showIf chains are not supported (${ref} is conditional)`);
  }
  return issues;
}

export const DEFAULT_QUESTIONNAIRE: QuestionnaireTemplate = questionnaireTemplateSchema.parse(defaultJson);

const TEMPLATES = new Map([[`${DEFAULT_QUESTIONNAIRE.key}@${DEFAULT_QUESTIONNAIRE.version}`, DEFAULT_QUESTIONNAIRE]]);

export function getQuestionnaireTemplate(key: string, version: number): QuestionnaireTemplate {
  const tpl = TEMPLATES.get(`${key}@${version}`);
  if (!tpl) throw new Error(`Unknown questionnaire template ${key}@${version}`);
  return tpl;
}

export function findQuestion(tpl: QuestionnaireTemplate, id: string): Question | undefined {
  return allQuestions(tpl).find((q) => q.id === id);
}
