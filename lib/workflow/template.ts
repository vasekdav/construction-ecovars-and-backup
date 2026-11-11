import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";
import defaultTemplateJson from "@/data/process/default.json";

/** Process template (SPEC §3). Pure module: data + validation, no DB/UI. */

export const MEDIA = ["O2", "N2"] as const;
export type Medium = (typeof MEDIA)[number];

const localized = z.object({ cs: z.string().min(1), en: z.string().min(1) });
export type Localized = z.infer<typeof localized>;

const roleList = z.array(z.enum(ROLES)).min(1);

export const gateConditionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("documentLinks"),
    kinds: z.array(z.string().min(1)).min(1),
    requireVersion: z.boolean(),
    requireDate: z.boolean(),
  }),
  z.object({ id: z.string().min(1), type: z.literal("manualCheck"), roles: roleList, label: localized }),
  z.object({ id: z.string().min(1), type: z.literal("allTasksDone"), label: localized }),
  z.object({ id: z.string().min(1), type: z.literal("ownerAssigned"), label: localized }),
  z.object({ id: z.string().min(1), type: z.literal("decisionRecorded"), label: localized }),
  z.object({ id: z.string().min(1), type: z.literal("questionnaireComplete"), label: localized }),
  /** A complete sizing result (inputs, result, source) is recorded (step 8). */
  z.object({ id: z.string().min(1), type: z.literal("sizingResultRecorded"), label: localized }),
  /** Every standard and rule applicable to the project is VERIFIED (step 5). */
  z.object({ id: z.string().min(1), type: z.literal("standardsVerified"), label: localized }),
  /** Rules mapped to this step are evaluated and have no (non-overridden) NO-GO. */
  z.object({ id: z.string().min(1), type: z.literal("rulesNoNoGo"), label: localized }),
  /** All required geometry inputs of the layout version are filled in. */
  z.object({ id: z.string().min(1), type: z.literal("layoutGeometryComplete"), which: z.enum(["concept", "final"]), label: localized }),
  z.object({
    id: z.string().min(1),
    type: z.literal("layoutVersion"),
    which: z.enum(["concept", "final"]),
    requireDrawing: z.boolean(),
  }),
  /** Condition implemented in a later phase: never met until then (safe default). */
  z.object({ id: z.string().min(1), type: z.literal("pendingFeature"), phase: z.number().int().min(1), label: localized }),
]);
export type GateCondition = z.infer<typeof gateConditionSchema>;

export const stageTemplateSchema = z.object({
  key: z.string().regex(/^[A-Z]?\d{1,2}$/),
  number: z.number().int().min(1).max(10).optional(),
  optional: z.boolean().optional(),
  title: localized,
  definitionOfDone: localized,
  ownerRoles: roleList,
  dependsOn: z.array(z.string()),
  media: z.array(z.enum(MEDIA)).min(1).optional(),
  layout: z.enum(["concept", "final"]).optional(),
  gate: z.array(gateConditionSchema).min(1),
});
export type StageTemplate = z.infer<typeof stageTemplateSchema>;

export const processTemplateSchema = z
  .object({
    key: z.string().min(1),
    version: z.number().int().min(1),
    title: localized,
    documentKinds: z.array(z.object({ key: z.string().min(1), title: localized })).min(1),
    stages: z.array(stageTemplateSchema).min(1),
  })
  .superRefine((tpl, ctx) => {
    for (const issue of templateIssues(tpl)) ctx.addIssue({ code: "custom", message: issue });
  });
export type ProcessTemplate = z.infer<typeof processTemplateSchema>;

/** Structural checks beyond the schema: unique keys, references, acyclic graph. */
export function templateIssues(tpl: Omit<ProcessTemplate, never>): string[] {
  const issues: string[] = [];
  const keys = new Set<string>();
  const numbers = new Set<number>();
  const kinds = new Set(tpl.documentKinds.map((k) => k.key));
  for (const s of tpl.stages) {
    if (keys.has(s.key)) issues.push(`duplicate stage key ${s.key}`);
    keys.add(s.key);
    if (s.optional) {
      if (s.number !== undefined) issues.push(`optional stage ${s.key} must not have a number`);
    } else {
      if (s.number === undefined) issues.push(`stage ${s.key} needs a number`);
      else if (numbers.has(s.number)) issues.push(`duplicate stage number ${s.number}`);
      else numbers.add(s.number);
      if (s.number !== undefined && String(s.number) !== s.key) issues.push(`stage ${s.key} key must equal its number`);
    }
    const gateIds = new Set<string>();
    for (const g of s.gate) {
      if (gateIds.has(g.id)) issues.push(`duplicate gate id ${g.id} in stage ${s.key}`);
      gateIds.add(g.id);
      if (g.type === "documentLinks") {
        for (const k of g.kinds) if (!kinds.has(k)) issues.push(`unknown document kind ${k} in stage ${s.key}`);
      }
      if ((g.type === "layoutVersion" || g.type === "layoutGeometryComplete") && s.layout !== g.which) {
        issues.push(`stage ${s.key} gate expects layout ${g.which}`);
      }
    }
  }
  for (const s of tpl.stages) {
    for (const d of s.dependsOn) {
      if (!keys.has(d)) issues.push(`stage ${s.key} depends on unknown stage ${d}`);
      if (d === s.key) issues.push(`stage ${s.key} depends on itself`);
    }
  }
  const cycle = findCycle(tpl.stages);
  if (cycle) issues.push(`dependency cycle: ${cycle.join(" → ")}`);
  return issues;
}

function findCycle(stages: readonly Pick<StageTemplate, "key" | "dependsOn">[]): string[] | null {
  const deps = new Map(stages.map((s) => [s.key, s.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (k: string): string[] | null => {
    if (state.get(k) === "done") return null;
    if (state.get(k) === "visiting") return [...stack.slice(stack.indexOf(k)), k];
    state.set(k, "visiting");
    stack.push(k);
    for (const d of deps.get(k) ?? []) {
      const c = visit(d);
      if (c) return c;
    }
    stack.pop();
    state.set(k, "done");
    return null;
  };
  for (const s of stages) {
    const c = visit(s.key);
    if (c) return c;
  }
  return null;
}

export const DEFAULT_TEMPLATE: ProcessTemplate = processTemplateSchema.parse(defaultTemplateJson);

const TEMPLATES = new Map([[`${DEFAULT_TEMPLATE.key}@${DEFAULT_TEMPLATE.version}`, DEFAULT_TEMPLATE]]);

export function getTemplate(key: string, version: number): ProcessTemplate {
  const tpl = TEMPLATES.get(`${key}@${version}`);
  if (!tpl) throw new Error(`Unknown process template ${key}@${version}`);
  return tpl;
}

export function stageTemplate(tpl: ProcessTemplate, key: string): StageTemplate {
  const s = tpl.stages.find((st) => st.key === key);
  if (!s) throw new Error(`Unknown stage ${key} in template ${tpl.key}`);
  return s;
}

/** Whether a stage applies to a project of the given medium at all. */
export function appliesToMedium(stage: StageTemplate, medium: Medium): boolean {
  return !stage.media || stage.media.includes(medium);
}

export function documentKindTitle(tpl: ProcessTemplate, kind: string, locale: "cs" | "en"): string {
  return tpl.documentKinds.find((k) => k.key === kind)?.title[locale] ?? kind;
}
