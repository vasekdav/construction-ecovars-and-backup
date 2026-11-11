import type { Answers } from "@/lib/questionnaire/answers";
import { quantity } from "@/lib/units";
import { analysePlan, type DerivedDistance, type Plan, type PlanAnalysis } from "./index";

/** Layout form section that holds the derived distances. */
const SECTION = "distances";

export interface EffectiveGeometry {
  answers: Answers;
  /** Question ids whose value comes from the plan (shown read-only). */
  derived: Map<string, DerivedDistance>;
  analysis: PlanAnalysis | null;
}

/**
 * Manual geometry answers overlaid with distances derived from the plan.
 * A derived value always wins over a manual one for the same question.
 */
export function effectiveGeometry(manual: Answers | null | undefined, plan: Plan | null | undefined): EffectiveGeometry {
  const answers: Answers = { ...(manual ?? {}) };
  const derived = new Map<string, DerivedDistance>();
  if (!plan || plan.objects.length === 0) return { answers, derived, analysis: null };
  const analysis = analysePlan(plan);
  for (const d of analysis.distances) {
    const id = `${SECTION}.${d.key}`;
    // Round to millimetres to keep the stored/displayed value stable.
    answers[id] = quantity(Math.round(d.distance * 1000) / 1000, "m");
    derived.set(id, d);
  }
  return { answers, derived, analysis };
}
