import { z } from "zod";
import { parameterSchema, TBD } from "@/lib/rules/rule";
import { MEDIA, type Medium } from "@/lib/workflow/template";

/**
 * Configurable calculation parameters (SPEC §6), versioned and verified like
 * rules: every edit creates a DRAFT version, Process Safety verifies.
 */
const localized = z.object({ cs: z.string().min(1), en: z.string().min(1) });

export const calcConfigSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  version: z.number().int().min(1),
  title: localized,
  description: localized,
  appliesTo: z.array(z.enum(MEDIA)).min(1),
  parameters: z.array(parameterSchema).min(1),
  /** Definition of normal conditions for Nm³ (temperature, pressure); TBD-VERIFY until stated. */
  normalConditions: z.string().min(1),
  source: z.object({ document: z.string().min(1), clause: z.string().min(1) }),
  status: z.enum(["DRAFT", "VERIFIED"]),
  verifiedBy: z.string().nullable(),
  verifiedAt: z.string().nullable(),
});
export type CalcConfig = z.infer<typeof calcConfigSchema>;

export function calcParamValues(config: CalcConfig, medium: Medium): Record<string, number | undefined> {
  return Object.fromEntries(config.parameters.map((p) => [p.key, p.values[medium]?.si ?? undefined]));
}

/** Everything that blocks verification: missing values for any applicable medium, TBD texts. */
export function calcConfigGaps(config: CalcConfig): string[] {
  const gaps = config.parameters.filter((p) => config.appliesTo.some((m) => !p.values[m])).map((p) => p.key);
  if (config.normalConditions.includes(TBD)) gaps.push("normalConditions");
  if (config.source.clause.includes(TBD) || config.source.document.includes(TBD)) gaps.push("source");
  return gaps;
}
