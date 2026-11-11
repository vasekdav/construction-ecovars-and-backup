import type { GateCondition } from "./template";

/** Evidence the gate is evaluated against (all from the project, no I/O here). */
export interface GateContext {
  documentLinks: readonly { kind: string; url: string; version: string | null; documentDate: string | null }[];
  manualChecks: Readonly<Record<string, { by: string; at: string } | undefined>>;
  tasks: readonly { done: boolean }[];
  decisions: readonly { rationale: string }[];
  layoutVersions: readonly { version: number; drawingUrl: string | null }[];
  ownerUserId: string | null;
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
  | "pending_feature";

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
    case "pendingFeature":
      return { ...base, met: false, failure: "pending_feature", details: [String(c.phase)] };
  }
}

export function evaluateGate(conditions: readonly GateCondition[], ctx: GateContext): GateEvaluation {
  const results = conditions.map((c) => evaluateCondition(c, ctx));
  return { passed: results.length > 0 && results.every((r) => r.met), results };
}
