import Link from "next/link";
import { ExportLinks } from "@/components/export-links";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { DecisionSupportBanner } from "@/components/decision-support-banner";
import { ResultBadge } from "@/components/result-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { asLocale } from "@/lib/i18n-helpers";
import { describe } from "@/lib/rules/expr";
import { RESULTS, TBD, type RuleResult } from "@/lib/rules/rule";
import { displayInput, INPUT_CATALOG } from "@/lib/safety/input-catalog";
import { evaluateProject, listOverrides, listSnapshots } from "@/lib/safety/project";
import { formatNumber, unitLabel } from "@/lib/units";
import { userNames } from "@/lib/workflow/queries";
import { overrideNoGoAction, revokeOverrideAction, snapshotAction } from "../../safety-actions";

const FILTERS = [...RESULTS, "overridden"] as const;
type Filter = (typeof FILTERS)[number];

export default async function SafetyReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { id } = await params;
  const { result: rawFilter } = await searchParams;
  const user = await requirePermission("project.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const evaluation = await evaluateProject(db, id);
  if (!evaluation) notFound();
  const filter = (FILTERS as readonly string[]).includes(rawFilter ?? "") ? (rawFilter as Filter) : null;
  const locale = asLocale(await getLocale());
  const nf = locale === "cs" ? "cs-CZ" : "en-GB";
  const [t, tRes, tSizing, format, snapshots, allOverrides] = await Promise.all([
    getTranslations("safety"),
    getTranslations("results"),
    getTranslations("sizing"),
    getFormatter(),
    listSnapshots(db, id),
    listOverrides(db, id),
  ]);
  const applied = new Set(evaluation.results.flatMap((r) => (r.override ? [r.override.id] : [])));
  const stale = allOverrides.filter((o) => !o.revokedAt && !applied.has(o.id));
  const names = await userNames(db, [
    ...evaluation.results.map((r) => r.override?.createdBy),
    ...snapshots.map((s) => s.evaluatedBy),
    ...allOverrides.map((o) => o.createdBy),
  ]);
  const { project, results, counts } = evaluation;
  const shown = results.filter((r) =>
    !filter ? true : filter === "overridden" ? r.result === "NO-GO" && !!r.override : r.result === filter && !(r.result === "NO-GO" && r.override),
  );
  const order: Record<RuleResult, number> = { "NO-GO": 0, WARNING: 1, NOT_EVALUATED: 2, GO: 3 };
  shown.sort((a, b) => order[a.result] - order[b.result] || a.ruleId.localeCompare(b.ruleId));
  const mayOverride = can(user.roles, "rule.override");
  const fmtDT = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });

  const summary: [Filter, number][] = [
    ["NO-GO", counts["NO-GO"]],
    ["WARNING", counts.WARNING],
    ["NOT_EVALUATED", counts.NOT_EVALUATED],
    ["GO", counts.GO],
    ["overridden", counts.overridden],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${project.id}`} className="text-sm text-primary underline">
          ← {project.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
      </div>
      <DecisionSupportBanner />

      <Card>
        <CardTitle>{t("summary")}</CardTitle>
        <div className="flex flex-wrap gap-3" data-testid="safety-summary">
          {summary.map(([k, n]) => (
            <Link
              key={k}
              href={`?result=${encodeURIComponent(k)}`}
              className="flex items-center gap-2 rounded border border-border px-3 py-2 hover:bg-muted"
              data-testid={`count-${k}`}
            >
              <ResultBadge result={k === "overridden" ? "NO-GO" : k} overridden={k === "overridden"} />
              <span className="text-lg font-semibold">{n}</span>
            </Link>
          ))}
          <Link href="?" className="self-center text-sm text-primary underline">
            {t("all")} ({results.length})
          </Link>
          {counts.draft > 0 && (
            <Badge variant="warning" className="self-center">
              DRAFT: {counts.draft}
            </Badge>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>{t("inputsLinks")}</CardTitle>
        <ul className="space-y-1 text-sm">
          <li>
            <Link className="text-primary underline" href={`/projects/${project.id}/questionnaire`}>
              {t("questionnaire")}
            </Link>
          </li>
          <li>
            <Link className="text-primary underline" href={`/projects/${project.id}/design-inputs`}>
              {t("designInputs")}
            </Link>
          </li>
          <li>
            <Link className="text-primary underline" href={`/projects/${project.id}/stages/3`}>
              {t("layoutGeometry")}
            </Link>{" "}
            <span className="text-muted-foreground">
              ({evaluation.layoutVersion === null ? t("noLayout") : t("layoutVersion", { version: evaluation.layoutVersion })})
            </span>
          </li>
          <li>
            <Link className="text-primary underline" href={`/projects/${project.id}/sizing`}>
              {tSizing("open")}
            </Link>
          </li>
        </ul>
      </Card>

      {stale.length > 0 && (
        <Alert tone="error" data-testid="stale-overrides">
          <div className="mb-1 font-semibold">{t("staleOverrides")}</div>
          <ul className="list-disc pl-5">
            {stale.map((o) => (
              <li key={o.id}>
                {o.ruleId} v{o.ruleVersion} · {names.get(o.createdBy)} · {fmtDT(o.createdAt)} – „{o.reason}“
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="space-y-3" data-testid="rules-list">
        {shown.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {shown.map((r) => (
          <details key={r.ruleId} className="rounded-lg border border-border bg-card shadow-sm" data-testid={`rule-${r.ruleId}`}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
              <ResultBadge result={r.result} overridden={!!r.override} />
              <span className="font-mono text-sm font-semibold">{r.ruleId}</span>
              <span className="flex-1 text-sm">{r.rule.title[locale]}</span>
              {r.status === "DRAFT" ? (
                <Badge variant="warning">{t("draftLabel")}</Badge>
              ) : (
                <Badge variant="success">{t("verifiedLabel")}</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {t("severity")}: {tRes(r.severity)} · {t("stages")}: {r.rule.stages.join(", ")}
              </span>
            </summary>
            <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
              {r.result !== "GO" && <p className="font-medium">{r.rule.message[locale]}</p>}
              {r.missingParams.length > 0 && <Alert tone="warning">{t("missingParams", { list: r.missingParams.join(", ") })}</Alert>}
              {r.missingInputs.length > 0 && <Alert>{t("missingInputs", { list: r.missingInputs.join(", ") })}</Alert>}
              <div>
                <div className="text-xs font-semibold text-muted-foreground">{t("condition")}</div>
                <code className="text-xs break-all">{describe(r.rule.condition)}</code>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{t("inputs")}</div>
                  <Table>
                    <TBody>
                      {Object.entries(r.inputs).map(([k, v]) => (
                        <Tr key={k}>
                          <Td>
                            {INPUT_CATALOG[k]?.label[locale] ?? k}
                            <div className="font-mono text-xs text-muted-foreground">{k}</div>
                          </Td>
                          <Td className="whitespace-nowrap">{displayInput(k, v, locale)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{t("params")}</div>
                  {r.rule.parameters.length === 0 ? (
                    <p className="text-muted-foreground">—</p>
                  ) : (
                    <Table>
                      <TBody>
                        {r.rule.parameters.map((p) => {
                          const q = p.values[project.medium];
                          return (
                            <Tr key={p.key}>
                              <Td>
                                {p.label[locale]}
                                <div className="font-mono text-xs text-muted-foreground">[{p.key}]</div>
                              </Td>
                              <Td className="whitespace-nowrap">
                                {q ? (
                                  `${formatNumber(q.input, 6, nf)} ${unitLabel(q.inputUnit)}`
                                ) : (
                                  <Badge variant="danger">{TBD}</Badge>
                                )}
                              </Td>
                            </Tr>
                          );
                        })}
                      </TBody>
                    </Table>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("source")}: {r.rule.source.document} · {r.rule.source.clause} · {t("version")}: {r.ruleVersion} ·{" "}
                <Link className="text-primary underline" href={`/rules/${r.ruleId}`}>
                  {r.ruleId}
                </Link>
              </div>
              {r.result !== "GO" && (
                <p>
                  <span className="font-semibold">{t("remediation")}:</span> {r.rule.remediation[locale]}
                </p>
              )}
              {r.override && (
                <Alert tone="error">
                  {t("overriddenBy", {
                    name: names.get(r.override.createdBy) ?? "",
                    date: fmtDT(r.override.createdAt),
                    reason: r.override.reason,
                  })}
                </Alert>
              )}
              {mayOverride && r.result === "NO-GO" && !r.override && (
                <ActionForm action={overrideNoGoAction} submitLabel={t("overrideSubmit")} variant="destructive" successText="" testId={`override-${r.ruleId}`}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="ruleId" value={r.ruleId} />
                  <Label htmlFor={`ov-${r.ruleId}`}>{t("overrideReason")}</Label>
                  <Textarea id={`ov-${r.ruleId}`} name="reason" required minLength={10} maxLength={2000} />
                </ActionForm>
              )}
              {mayOverride && r.override && (
                <ActionForm action={revokeOverrideAction} submitLabel={t("revoke")} variant="outline" successText="">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="overrideId" value={r.override.id} />
                  <Label htmlFor={`rv-${r.ruleId}`}>{t("revokeReason")}</Label>
                  <Textarea id={`rv-${r.ruleId}`} name="reason" required maxLength={2000} />
                </ActionForm>
              )}
            </div>
          </details>
        ))}
      </div>

      <ExportLinks projectId={project.id} />

      <Card>
        <CardTitle>{t("snapshots")}</CardTitle>
        {can(user.roles, "safety.snapshot") && (
          <ActionForm action={snapshotAction} submitLabel={t("snapshot")} variant="outline" successText="" testId="snapshot-form" className="mb-4">
            <input type="hidden" name="projectId" value={project.id} />
          </ActionForm>
        )}
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSnapshots")}</p>
        ) : (
          <Table data-testid="snapshots">
            <THead>
              <Tr>
                <Th>{t("result")}</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {snapshots.map((s) => (
                <Tr key={s.runId}>
                  <Td className="whitespace-nowrap">
                    {fmtDT(s.evaluatedAt)} · {names.get(s.evaluatedBy)}
                  </Td>
                  <Td className="text-xs">
                    {Object.entries(s.counts)
                      .map(([k, n]) => `${tRes(k as RuleResult)}: ${n}`)
                      .join(" · ")}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
