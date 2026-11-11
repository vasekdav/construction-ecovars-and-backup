import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import pkg from "@/package.json";
import type { Db } from "@/db/client";
import { projects, stages } from "@/db/schema";
import { SIZING_RESULT_FORM } from "@/lib/forms";
import { formatAnswer } from "@/lib/questionnaire/format";
import { findQuestion } from "@/lib/questionnaire/template";
import { getQuestionnaire } from "@/lib/questionnaire/service";
import { describe } from "@/lib/rules/expr";
import { TBD, type RuleResult } from "@/lib/rules/rule";
import { displayInput, INPUT_CATALOG } from "@/lib/safety/input-catalog";
import { evaluateProject, listOverrides } from "@/lib/safety/project";
import { listStandards } from "@/lib/safety/standards-service";
import { getLatestSizing, projectAutonomy } from "@/lib/sizing/service";
import { formatNumber, fromSI, unitLabel } from "@/lib/units";
import { userNames } from "@/lib/workflow/queries";
import { getTemplate, stageTemplate } from "@/lib/workflow/template";
import type { StageState } from "@/lib/workflow/types";
import { LABELS, type ExportLocale } from "./labels";

/**
 * Plain data model of the "Design Basis & Safety Review" export (SPEC §8).
 * All values are pre-formatted strings so the renderers stay trivial and the
 * three formats show exactly the same content.
 */
export interface ReportModel {
  meta: {
    reportId: string;
    title: string;
    appVersion: string;
    commit: string | null;
    generatedAt: string;
    generatedBy: string;
    locale: ExportLocale;
    disclaimer: string;
    fictitious: string;
  };
  project: { name: string; customer: string; location: string; medium: string; owner: string; status: string };
  steps: { key: string; title: string; state: StageState; stateLabel: string; gate: string }[];
  questionnaire: { phase: string; initialPercent: number; detailedPercent: number; template: string };
  designBasis: { key: string; label: string; value: string; si: string; source: string }[];
  sizing: { version: number; source: string; rows: { label: string; value: string }[] } | null;
  autonomy: {
    status: string;
    conservative: string;
    informative: string;
    required: string;
    verdict: string;
    steps: { label: string; value: string }[];
    params: { key: string; label: string; value: string; tbd: boolean }[];
    config: string;
    configStatus: "DRAFT" | "VERIFIED" | "—";
    missing: string[];
  };
  safety: {
    counts: { label: string; value: number }[];
    rules: {
      id: string;
      title: string;
      category: string;
      status: "DRAFT" | "VERIFIED";
      version: number;
      result: RuleResult;
      resultLabel: string;
      overridden: boolean;
      severity: string;
      stages: string;
      condition: string;
      message: string;
      remediation: string;
      source: string;
      inputs: { key: string; label: string; value: string }[];
      params: { key: string; label: string; value: string; tbd: boolean }[];
      missing: string[];
      fingerprint: string;
    }[];
  };
  overrides: {
    ruleId: string;
    ruleVersion: number;
    /** applied = currently suppresses the NO-GO; stale = not revoked, but rule version or inputs changed. */
    state: "applied" | "stale" | "revoked";
    stateLabel: string;
    reason: string;
    by: string;
    at: string;
    revoked: string | null;
  }[];
  standards: { code: string; title: string; revision: string; status: string }[];
}

export const APP_VERSION: string = pkg.version;

export async function buildReport(
  db: Db,
  projectId: string,
  user: { name: string },
  locale: ExportLocale = "cs",
): Promise<ReportModel | null> {
  const L = LABELS[locale];
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const nf = locale === "cs" ? "cs-CZ" : "en-GB";
  const dt = (d: Date) =>
    new Intl.DateTimeFormat(nf, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Prague" }).format(d);
  const tpl = getTemplate(project.templateKey, project.templateVersion);
  const stageRows = await db.select().from(stages).where(eq(stages.projectId, projectId)).orderBy(asc(stages.sortOrder));
  const [questionnaire, sizing, autonomy, evaluation, overrides, standards] = await Promise.all([
    getQuestionnaire(db, projectId),
    getLatestSizing(db, projectId),
    projectAutonomy(db, project),
    evaluateProject(db, projectId),
    listOverrides(db, projectId),
    listStandards(db),
  ]);
  const names = await userNames(db, [
    project.ownerUserId,
    ...stageRows.map((s) => s.gatePassedBy),
    ...overrides.flatMap((o) => [o.createdBy, o.revokedBy]),
  ]);

  const appliedOverrides = new Set((evaluation?.results ?? []).flatMap((e) => (e.override ? [e.override.id] : [])));

  // ---- Design Basis
  const designBasis: ReportModel["designBasis"] = [];
  if (questionnaire?.designBasis) {
    for (const [key, f] of Object.entries(questionnaire.designBasis.fields)) {
      const q = findQuestion(questionnaire.template, f.source);
      designBasis.push({
        key,
        label: q?.label[locale] ?? key,
        value: q ? formatAnswer(q, f.quantity ?? f.value, locale) : String(f.value),
        si: f.quantity ? `${formatNumber(f.quantity.si, 6, nf)} ${unitLabel(f.quantity.siUnit)}` : "—",
        source: f.source,
      });
    }
  }

  // ---- Sizing + autonomy
  const sizingModel: ReportModel["sizing"] = sizing
    ? {
        version: sizing.version,
        source: `${String(sizing.answers["source.file_name"] ?? "—")} rev. ${String(sizing.answers["source.file_revision"] ?? "—")}, ${String(sizing.answers["source.author"] ?? "—")}, ${String(sizing.answers["source.date"] ?? "—")}`,
        rows: SIZING_RESULT_FORM.sections.flatMap((s) =>
          s.questions.map((q) => ({ label: q.label[locale], value: formatAnswer(q, sizing.answers[q.id], locale) })),
        ),
      }
    : null;
  const r = autonomy.result;
  const hours = (s: number | null | undefined) => (s === null || s === undefined ? "—" : `${formatNumber(s / 3600, 2, nf)} h`);
  const autonomyModel: ReportModel["autonomy"] = {
    status: r.status === "OK" ? "OK" : L.notEvaluated,
    conservative: hours(r.autonomyPeak),
    informative: hours(r.autonomyAvg),
    required: hours(autonomy.inputs.requiredAutonomy),
    verdict: r.meetsRequirement === null ? "—" : r.meetsRequirement ? L.meets : L.notMeets,
    steps: [
      { label: L.usable, value: r.usableLiquidVolume === null ? "—" : `${formatNumber(r.usableLiquidVolume, 3, nf)} m³` },
      { label: L.ratio, value: r.expansionRatio === null ? "—" : formatNumber(r.expansionRatio, 3, nf) },
      { label: L.gas, value: r.gasVolumeNormal === null ? "—" : `${formatNumber(r.gasVolumeNormal, 1, nf)} Nm³` },
      { label: "V_tank", value: autonomy.inputs.tankVolume === undefined ? "—" : `${formatNumber(autonomy.inputs.tankVolume, 3, nf)} m³` },
      { label: "Q_peak", value: autonomy.inputs.qPeak === undefined ? "—" : `${formatNumber(fromSI(autonomy.inputs.qPeak, "Nm3/h"), 1, nf)} Nm³/h` },
      { label: "Q_avg", value: autonomy.inputs.qAvg === undefined ? "—" : `${formatNumber(fromSI(autonomy.inputs.qAvg, "Nm3/h"), 1, nf)} Nm³/h` },
    ],
    params: (autonomy.config?.config.parameters ?? []).map((p) => {
      const q = p.values[project.medium];
      return { key: p.key, label: p.label[locale], value: q ? `${formatNumber(q.input, 6, nf)} ${unitLabel(q.inputUnit)}` : TBD, tbd: !q };
    }),
    config: autonomy.config
      ? `${autonomy.config.config.key} v${autonomy.config.config.version} · ${L.normalConditions}: ${autonomy.config.config.normalConditions}`
      : "—",
    configStatus: autonomy.config?.status ?? "—",
    missing: [...r.missingParams, ...r.missingInputs, ...r.invalid.map((x) => `${x} (${L.invalid})`)],
  };

  // ---- Safety review
  const rules: ReportModel["safety"]["rules"] = (evaluation?.results ?? [])
    .slice()
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
    .map((e) => ({
      id: e.ruleId,
      title: e.rule.title[locale],
      category: e.rule.category,
      status: e.status,
      version: e.ruleVersion,
      result: e.result,
      resultLabel: e.result === "NO-GO" && e.override ? `${L.results["NO-GO"]} (OVERRIDE)` : L.results[e.result],
      overridden: !!e.override,
      severity: L.results[e.severity],
      stages: e.rule.stages.join(", "),
      condition: describe(e.rule.condition),
      message: e.rule.message[locale],
      remediation: e.rule.remediation[locale],
      source: `${e.rule.source.document} · ${e.rule.source.clause}`,
      inputs: Object.entries(e.inputs).map(([k, v]) => ({
        key: k,
        label: INPUT_CATALOG[k]?.label[locale] ?? k,
        value: displayInput(k, v, locale),
      })),
      params: e.rule.parameters.map((p) => {
        const q = p.values[project.medium];
        return { key: p.key, label: p.label[locale], value: q ? `${formatNumber(q.input, 6, nf)} ${unitLabel(q.inputUnit)}` : TBD, tbd: !q };
      }),
      missing: [...e.missingParams, ...e.missingInputs],
      fingerprint: e.fingerprint.slice(0, 12),
    }));
  const c = evaluation?.counts;
  const counts = c
    ? [
        { label: L.results["NO-GO"], value: c["NO-GO"] },
        { label: L.results.WARNING, value: c.WARNING },
        { label: L.results.NOT_EVALUATED, value: c.NOT_EVALUATED },
        { label: L.results.GO, value: c.GO },
        { label: "OVERRIDE", value: c.overridden },
        { label: "DRAFT", value: c.draft },
      ]
    : [];

  return {
    meta: {
      reportId: randomUUID(),
      title: L.title,
      appVersion: APP_VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? null,
      generatedAt: dt(new Date()),
      generatedBy: user.name,
      locale,
      disclaimer: L.disclaimer,
      fictitious: L.fictitious,
    },
    project: {
      name: project.name,
      customer: project.customer,
      location: project.location,
      medium: L.medium[project.medium],
      owner: names.get(project.ownerUserId) ?? "—",
      status: project.status,
    },
    steps: stageRows
      .filter((s) => s.enabled)
      .map((s) => ({
        key: s.key,
        title: stageTemplate(tpl, s.key).title[locale],
        state: s.state,
        stateLabel: L.states[s.state],
        gate: s.gatePassedAt ? `${names.get(s.gatePassedBy ?? "") ?? "—"}, ${dt(s.gatePassedAt)}` : "—",
      })),
    questionnaire: {
      phase: questionnaire?.phase === "DETAILED" ? L.phaseDetailed : L.phaseInitial,
      initialPercent: questionnaire?.initial.percent ?? 0,
      detailedPercent: questionnaire?.detailed.percent ?? 0,
      template: questionnaire ? `${questionnaire.template.key}@${questionnaire.template.version}` : "—",
    },
    designBasis,
    sizing: sizingModel,
    autonomy: autonomyModel,
    safety: { counts, rules },
    overrides: overrides.map((o) => {
      const state = o.revokedAt ? "revoked" : appliedOverrides.has(o.id) ? "applied" : "stale";
      return {
      ruleId: o.ruleId,
      ruleVersion: o.ruleVersion,
      state,
      stateLabel: L.overrideState[state],
      reason: o.reason,
      by: names.get(o.createdBy) ?? "—",
      at: dt(o.createdAt),
      revoked: o.revokedAt ? `${names.get(o.revokedBy ?? "") ?? "—"}, ${dt(o.revokedAt)}: ${o.revokeReason ?? ""}` : null,
      };
    }),
    standards: standards
      .filter((s) => s.appliesTo.includes(project.medium))
      .map((s) => ({ code: s.code, title: locale === "cs" ? s.titleCs : s.titleEn, revision: s.revision ?? TBD, status: s.status })),
  };
}
