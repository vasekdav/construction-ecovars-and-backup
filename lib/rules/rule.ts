import { z } from "zod";
import { DIMENSIONS, isUnit, type Quantity, type UnitId } from "@/lib/units";
import { MEDIA, type Medium } from "@/lib/workflow/template";
import { boolExprSchema, collectRefs, evalBool, type Primitive } from "./expr";

/** Rule definition (SPEC §7.1). Pure module. */

export const SEVERITIES = ["NO-GO", "WARNING"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const RULE_STATUSES = ["DRAFT", "VERIFIED"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];
export const RESULTS = ["GO", "WARNING", "NO-GO", "NOT_EVALUATED"] as const;
export type RuleResult = (typeof RESULTS)[number];

/** Marker for values that must be supplied and verified by Process Safety. */
export const TBD = "TBD-VERIFY";

const localized = z.object({ cs: z.string().min(1), en: z.string().min(1) });

const quantitySchema = z.object({
  si: z.number().finite(),
  siUnit: z.string().refine(isUnit).transform((u) => u as UnitId),
  input: z.number().finite(),
  inputUnit: z.string().refine(isUnit).transform((u) => u as UnitId),
});

export const parameterSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: localized,
  dimension: z.enum(DIMENSIONS),
  /** Per-medium value; null = TBD-VERIFY (no default, SPEC §0.3). */
  values: z.object({ O2: quantitySchema.nullable().optional(), N2: quantitySchema.nullable().optional() }),
  note: localized.optional(),
});
export type RuleParameter = z.infer<typeof parameterSchema>;

export const ruleSchema = z
  .object({
    id: z.string().regex(/^R-[A-Z0-9]+-\d{2}$/),
    version: z.number().int().min(1),
    category: z.string().min(1),
    appliesTo: z.array(z.enum(MEDIA)).min(1),
    title: localized,
    inputs: z.array(z.object({ key: z.string().regex(/^[a-z]+\.[a-zA-Z0-9_]+$/), label: localized })).min(1),
    parameters: z.array(parameterSchema),
    condition: boolExprSchema,
    severity: z.enum(SEVERITIES),
    message: localized,
    remediation: localized,
    source: z.object({ document: z.string().min(1), clause: z.string().min(1) }),
    status: z.enum(RULE_STATUSES),
    verifiedBy: z.string().nullable(),
    verifiedAt: z.string().nullable(),
    /** Process steps whose gate is blocked by a NO-GO of this rule. */
    stages: z.array(z.string()).min(1),
  })
  .superRefine((r, ctx) => {
    for (const issue of ruleIssues(r as Rule)) ctx.addIssue({ code: "custom", message: issue });
  });
export type Rule = z.infer<typeof ruleSchema>;

export function ruleIssues(r: Pick<Rule, "inputs" | "parameters" | "condition" | "appliesTo" | "status" | "verifiedBy" | "verifiedAt">): string[] {
  const issues: string[] = [];
  const refs = collectRefs(r.condition);
  const declaredInputs = new Set(r.inputs.map((i) => i.key));
  const declaredParams = new Set(r.parameters.map((p) => p.key));
  if (declaredInputs.size !== r.inputs.length) issues.push("duplicate input");
  if (declaredParams.size !== r.parameters.length) issues.push("duplicate parameter");
  for (const i of refs.inputs) if (!declaredInputs.has(i)) issues.push(`undeclared input ${i}`);
  for (const p of refs.params) if (!declaredParams.has(p)) issues.push(`undeclared parameter ${p}`);
  for (const i of declaredInputs) if (!refs.inputs.includes(i)) issues.push(`unused input ${i}`);
  for (const p of declaredParams) if (!refs.params.includes(p)) issues.push(`unused parameter ${p}`);
  for (const p of r.parameters) {
    for (const m of Object.keys(p.values) as Medium[]) {
      if (!r.appliesTo.includes(m)) issues.push(`parameter ${p.key} has a value for non-applicable medium ${m}`);
    }
  }
  if (r.status === "VERIFIED" && (!r.verifiedBy || !r.verifiedAt)) issues.push("VERIFIED rule needs verifiedBy and verifiedAt");
  return issues;
}

/** Parameter values for a medium in SI; undefined = missing (TBD-VERIFY). */
export function parameterValues(rule: Rule, medium: Medium): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const p of rule.parameters) out[p.key] = p.values[medium]?.si ?? undefined;
  return out;
}

export function missingParameters(rule: Rule, media: readonly Medium[] = rule.appliesTo): string[] {
  return rule.parameters.filter((p) => media.some((m) => !p.values[m])).map((p) => p.key);
}

export interface RuleEvaluation {
  ruleId: string;
  ruleVersion: number;
  status: RuleStatus;
  severity: Severity;
  result: RuleResult;
  missingInputs: string[];
  missingParams: string[];
  /** Snapshot of the inputs and parameters used (SI), for reproducibility. */
  inputs: Record<string, Primitive | null>;
  params: Record<string, number | null>;
}

/**
 * Evaluate one rule for a project. Returns null when the rule does not apply
 * to the medium. A missing parameter always yields NOT_EVALUATED; a missing
 * input yields NOT_EVALUATED unless the outcome is already decided by other
 * inputs (Kleene logic). The result is never GO when anything is unknown.
 */
export function evaluateRule(
  rule: Rule,
  medium: Medium,
  inputs: Readonly<Record<string, Primitive | undefined>>,
): RuleEvaluation | null {
  if (!rule.appliesTo.includes(medium)) return null;
  const refs = collectRefs(rule.condition);
  const params = parameterValues(rule, medium);
  const missingParams = refs.params.filter((p) => params[p] === undefined);
  const missingInputs = refs.inputs.filter((i) => inputs[i] === undefined);
  const snapshotInputs = Object.fromEntries(refs.inputs.map((i) => [i, inputs[i] ?? null]));
  const snapshotParams = Object.fromEntries(refs.params.map((p) => [p, params[p] ?? null]));
  const base = {
    ruleId: rule.id,
    ruleVersion: rule.version,
    status: rule.status,
    severity: rule.severity,
    missingInputs,
    missingParams,
    inputs: snapshotInputs,
    params: snapshotParams,
  };
  if (missingParams.length) return { ...base, result: "NOT_EVALUATED" };
  const tri = evalBool(rule.condition, { inputs, params });
  const result: RuleResult = tri === "T" ? "GO" : tri === "F" ? rule.severity : "NOT_EVALUATED";
  return { ...base, result };
}

/** Canonical JSON (sorted keys) of what a result depends on; used to bind overrides. */
export function evaluationFingerprint(e: Pick<RuleEvaluation, "ruleId" | "ruleVersion" | "inputs" | "params">): string {
  const sort = (o: Record<string, unknown>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return JSON.stringify({ r: e.ruleId, v: e.ruleVersion, i: sort(e.inputs), p: sort(e.params) });
}

export type { Quantity };
