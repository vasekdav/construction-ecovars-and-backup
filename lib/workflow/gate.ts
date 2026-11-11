import type { GateCondition } from "./template";

/** Evidence the gate is evaluated against (all from the project, no I/O here). */
export interface GateContext {
  documentLinks: readonly { kind: string; url: string; version: string | null; documentDate: string | null }[];
  manualChecks: Readonly<Record<string, { by: string; at: string } | undefined>>;
  tasks: readonly { done: boolean }[];
  decisions: readonly { rationale: string }[];
  layoutVersions: readonly { version: number; drawingUrl: string | null }[];
  ownerUserId: string | null;
  /** Customer questionnaire status of the project (null = not started). */
  questionnaire?: { phase: "INITIAL" | "DETAILED"; missing: number } | null;
  /** Rule check status of this stage (rules whose `stages` include it). */
  rules?: { noGo: string[]; notEvaluated: string[] } | null;
  /** Rules and standards applicable to the project that are not VERIFIED. */
  verification?: {
    unverifiedRules: string[];
    unverifiedStandards: string[];
    standardsCount: number;
    /** Calculation configs (e.g. autonomy parameters) that are not VERIFIED. */
    unverifiedCalc?: string[];
  } | null;
  /** Latest recorded sizing result version (null = none). */
  sizing?: { version: number | null } | null;
  /** Missing required geometry inputs per layout kind (null = no such layout version). */
  layoutGeometry?: { concept: number | null; final: number | null } | null;
}

export type GateFailure =
  | "missing_documents"
  | "missing_version"
  | "missing_date"
  | "not_confirmed"
  | "open_tasks"
  | "no_owner"
  | "no_decision"
  | "no_layout"
  | "no_drawing"
  | "pending_feature"
  | "questionnaire_initial_phase"
  | "questionnaire_incomplete"
  | "unverified_rules"
  | "unverified_standards"
  | "no_standards"
  | "rules_no_go"
  | "rules_not_evaluated"
  | "geometry_incomplete"
  | "unverified_calc"
  | "no_sizing"
  | "no_rules";

export interface ConditionResult {
  id: string;
  type: GateCondition["type"];
  met: boolean;
  failure?: GateFailure;
  /** e.g. the missing document kinds or the number of open tasks */
  details?: string[];
}

export interface GateEvaluation {
  passed: boolean;
  results: ConditionResult[];
}

function evaluateCondition(c: GateCondition, ctx: GateContext): ConditionResult {
  const base = { id: c.id, type: c.type };
  switch (c.type) {
    case "documentLinks": {
      const missing: string[] = [];
      const noVersion: string[] = [];
      const noDate: string[] = [];
      for (const kind of c.kinds) {
        const links = ctx.documentLinks.filter((l) => l.kind === kind && l.url);
        if (links.length === 0) missing.push(kind);
        else {
          if (c.requireVersion && !links.some((l) => l.version?.trim())) noVersion.push(kind);
          if (c.requireDate && !links.some((l) => l.documentDate)) noDate.push(kind);
        }
      }
      if (missing.length) return { ...base, met: false, failure: "missing_documents", details: missing };
      if (noVersion.length) return { ...base, met: false, failure: "missing_version", details: noVersion };
      if (noDate.length) return { ...base, met: false, failure: "missing_date", details: noDate };
      return { ...base, met: true };
    }
    case "manualCheck":
      return ctx.manualChecks[c.id] ? { ...base, met: true } : { ...base, met: false, failure: "not_confirmed" };
    case "allTasksDone": {
      const open = ctx.tasks.filter((t) => !t.done).length;
      return open === 0 ? { ...base, met: true } : { ...base, met: false, failure: "open_tasks", details: [String(open)] };
    }
    case "ownerAssigned":
      return ctx.ownerUserId ? { ...base, met: true } : { ...base, met: false, failure: "no_owner" };
    case "decisionRecorded":
      return ctx.decisions.some((d) => d.rationale.trim())
        ? { ...base, met: true }
        : { ...base, met: false, failure: "no_decision" };
    case "layoutVersion": {
      const candidates = ctx.layoutVersions.filter((v) => (c.which === "concept" ? v.version === 0 : v.version >= 1));
      if (candidates.length === 0) return { ...base, met: false, failure: "no_layout" };
      if (c.requireDrawing && !candidates.some((v) => v.drawingUrl)) return { ...base, met: false, failure: "no_drawing" };
      return { ...base, met: true };
    }
    case "questionnaireComplete": {
      const q = ctx.questionnaire;
      if (!q || q.phase !== "DETAILED") return { ...base, met: false, failure: "questionnaire_initial_phase" };
      if (q.missing > 0) return { ...base, met: false, failure: "questionnaire_incomplete", details: [String(q.missing)] };
      return { ...base, met: true };
    }
    case "standardsVerified": {
      const v = ctx.verification;
      if (!v || v.standardsCount === 0) return { ...base, met: false, failure: "no_standards" };
      if (v.unverifiedStandards.length) return { ...base, met: false, failure: "unverified_standards", details: v.unverifiedStandards };
      if (v.unverifiedRules.length) return { ...base, met: false, failure: "unverified_rules", details: v.unverifiedRules };
      if (v.unverifiedCalc?.length) return { ...base, met: false, failure: "unverified_calc", details: v.unverifiedCalc };
      return { ...base, met: true };
    }
    case "rulesNoNoGo": {
      const r = ctx.rules;
      if (!r) return { ...base, met: false, failure: "no_rules" };
      if (r.noGo.length) return { ...base, met: false, failure: "rules_no_go", details: r.noGo };
      if (r.notEvaluated.length) return { ...base, met: false, failure: "rules_not_evaluated", details: r.notEvaluated };
      return { ...base, met: true };
    }
    case "layoutGeometryComplete": {
      const missing = ctx.layoutGeometry?.[c.which] ?? null;
      if (missing === null) return { ...base, met: false, failure: "no_layout" };
      if (missing > 0) return { ...base, met: false, failure: "geometry_incomplete", details: [String(missing)] };
      return { ...base, met: true };
    }
    case "sizingResultRecorded":
      return ctx.sizing?.version ? { ...base, met: true, details: [`v${ctx.sizing.version}`] } : { ...base, met: false, failure: "no_sizing" };
    case "pendingFeature":
      return { ...base, met: false, failure: "pending_feature", details: [String(c.phase)] };
  }
}

export function evaluateGate(conditions: readonly GateCondition[], ctx: GateContext): GateEvaluation {
  const results = conditions.map((c) => evaluateCondition(c, ctx));
  return { passed: results.length > 0 && results.every((r) => r.met), results };
}
