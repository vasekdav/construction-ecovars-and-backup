import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { DecisionSupportBanner } from "@/components/decision-support-banner";
import { QuestionnaireSectionForm } from "@/components/questionnaire/section-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { projects, stages } from "@/db/schema";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { SIZING_RESULT_FORM } from "@/lib/forms";
import { asLocale } from "@/lib/i18n-helpers";
import { formatAnswer } from "@/lib/questionnaire/format";
import { TBD } from "@/lib/rules/rule";
import { getSizingHistory, projectAutonomy } from "@/lib/sizing/service";
import { formatNumber, fromSI, unitLabel } from "@/lib/units";
import { userNames } from "@/lib/workflow/queries";
import { recordSizingAction } from "../../sizing-actions";

export default async function SizingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("project.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();
  const [s8] = await db.select({ state: stages.state }).from(stages).where(and(eq(stages.projectId, id), eq(stages.key, "8")));
  const [history, autonomy] = await Promise.all([getSizingHistory(db, id), projectAutonomy(db, project)]);
  const latest = history[0];
  const locale = asLocale(await getLocale());
  const nf = locale === "cs" ? "cs-CZ" : "en-GB";
  const [t, tA, tSafety, format, names] = await Promise.all([
    getTranslations("sizing"),
    getTranslations("autonomy"),
    getTranslations("safety"),
    getFormatter(),
    userNames(db, history.map((h) => h.createdBy)),
  ]);
  const frozen = s8?.state === "CLOSED";
  const mayWrite = can(user.roles, "sizing.write") && !frozen;
  const r = autonomy.result;
  const h = (s: number | null) => (s === null ? "—" : `${formatNumber(s / 3600, 2, nf)} h`);
  const n = (v: number | null | undefined, unit: Parameters<typeof unitLabel>[0], digits = 3) =>
    v === null || v === undefined ? "—" : `${formatNumber(fromSI(v, unit), digits, nf)} ${unitLabel(unit)}`;
  const src = (a: (typeof history)[number]) =>
    t("source", {
      file: String(a.answers["source.file_name"] ?? "—"),
      revision: String(a.answers["source.file_revision"] ?? "—"),
      author: String(a.answers["source.author"] ?? "—"),
      date: String(a.answers["source.date"] ?? "—"),
    });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-primary underline">
          ← {project.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <Link href={`/projects/${id}/safety`} className="ml-auto text-sm text-primary underline">
            {tSafety("title")} →
          </Link>
        </div>
      </div>
      <DecisionSupportBanner />

      <Card data-testid="autonomy-card">
        <CardTitle>{tA("title")}</CardTitle>
        {r.status === "OK" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">{tA("conservative")}</div>
              <div className="text-2xl font-semibold" data-testid="autonomy-peak">
                {h(r.autonomyPeak)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{tA("informative")}</div>
              <div className="text-2xl font-semibold">{h(r.autonomyAvg)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{tA("required")}</div>
              <div className="text-2xl font-semibold">{h(autonomy.inputs.requiredAutonomy ?? null)}</div>
              {r.meetsRequirement !== null && (
                <Badge variant={r.meetsRequirement ? "success" : "danger"} data-testid="autonomy-verdict">
                  {r.meetsRequirement ? tA("meets") : tA("notMeets")}
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Badge data-testid="autonomy-status">{tA("notEvaluated")}</Badge>
            {r.missingParams.length > 0 && <Alert tone="warning">{tA("missingParams", { list: r.missingParams.join(", ") })}</Alert>}
            {r.missingInputs.length > 0 && <Alert>{tA("missingInputs", { list: r.missingInputs.join(", ") })}</Alert>}
          </div>
        )}
        {r.invalid.length > 0 && <Alert tone="error" className="mt-3">{tA("invalid", { list: r.invalid.join(", ") })}</Alert>}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold">{tA("formula")}</div>
            <ul className="space-y-1 text-sm">
              <li>
                {tA("usable")} = <strong>{n(r.usableLiquidVolume, "m3")}</strong>
              </li>
              <li>
                {tA("ratio")} = <strong>{r.expansionRatio === null ? "—" : formatNumber(r.expansionRatio, 3, nf)}</strong>
              </li>
              <li>
                {tA("gas")} = <strong>{r.gasVolumeNormal === null ? "—" : `${formatNumber(r.gasVolumeNormal, 1, nf)} Nm³`}</strong>
              </li>
              <li>{tA("time")}</li>
            </ul>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">{tA("assumptions")}</div>
            <Table>
              <TBody>
                {autonomy.config?.config.parameters.map((p) => {
                  const q = p.values[project.medium];
                  return (
                    <Tr key={p.key}>
                      <Td>
                        {p.label[locale]} <code className="text-xs">[{p.key}]</code>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {q ? `${formatNumber(q.input, 6, nf)} ${unitLabel(q.inputUnit)}` : <Badge variant="danger">{TBD}</Badge>}
                      </Td>
                    </Tr>
                  );
                })}
                <Tr>
                  <Td>{tA("normalConditions")}</Td>
                  <Td>{autonomy.config?.config.normalConditions ?? TBD}</Td>
                </Tr>
                <Tr>
                  <Td>{tA("tankVolume", { version: autonomy.sizingVersion ?? "—" })}</Td>
                  <Td>{n(autonomy.inputs.tankVolume, "m3")}</Td>
                </Tr>
                <Tr>
                  <Td>{tA("qPeak")}</Td>
                  <Td>{n(autonomy.inputs.qPeak, "Nm3/h", 1)}</Td>
                </Tr>
                <Tr>
                  <Td>{tA("qAvg")}</Td>
                  <Td>{n(autonomy.inputs.qAvg, "Nm3/h", 1)}</Td>
                </Tr>
              </TBody>
            </Table>
            {autonomy.config && (
              <p className="mt-2 text-xs text-muted-foreground">
                {tA("config", { key: autonomy.config.config.key, version: autonomy.config.config.version })} ·{" "}
                {autonomy.config.status === "DRAFT" ? (
                  <Badge variant="warning">{tSafety("draftLabel")}</Badge>
                ) : (
                  <Badge variant="success">VERIFIED</Badge>
                )}{" "}
                ·{" "}
                <Link href="/calc/autonomy" className="text-primary underline">
                  {tA("edit")}
                </Link>
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>{latest ? t("latest", { version: latest.version }) : t("none")}</CardTitle>
        {latest && (
          <>
            <p className="mb-3 text-sm text-muted-foreground" data-testid="sizing-source">
              {src(latest)}
            </p>
            <Table data-testid="sizing-latest">
              <TBody>
                {SIZING_RESULT_FORM.sections.flatMap((s) =>
                  s.questions.map((q) => (
                    <Tr key={q.id}>
                      <Td>{q.label[locale]}</Td>
                      <Td>
                        {q.type === "url" && typeof latest.answers[q.id] === "string" ? (
                          <a className="text-primary underline" href={String(latest.answers[q.id])} target="_blank" rel="noopener noreferrer">
                            {String(latest.answers[q.id])}
                          </a>
                        ) : (
                          formatAnswer(q, latest.answers[q.id], locale)
                        )}
                      </Td>
                    </Tr>
                  )),
                )}
              </TBody>
            </Table>
          </>
        )}
      </Card>

      <Card>
        <CardTitle>{t("record")}</CardTitle>
        {frozen && <Alert tone="success">{t("frozen")}</Alert>}
        {!frozen && !mayWrite && <Alert>{t("readOnly")}</Alert>}
        {mayWrite && (
          <>
            <p className="mb-4 text-xs text-muted-foreground">{t("recordHint")}</p>
            <QuestionnaireSectionForm
              projectId={id}
              section={SIZING_RESULT_FORM.sections}
              medium={project.medium}
              answers={latest?.answers ?? {}}
              locale={locale}
              readOnly={false}
              action={recordSizingAction}
              submitLabel={t("record")}
            />
          </>
        )}
      </Card>

      {history.length > 0 && (
        <Card>
          <CardTitle>{t("history")}</CardTitle>
          <Table data-testid="sizing-history">
            <THead>
              <Tr>
                <Th>v</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {history.map((v) => (
                <Tr key={v.id}>
                  <Td>v{v.version}</Td>
                  <Td className="text-sm">
                    {format.dateTime(v.createdAt, { dateStyle: "short", timeStyle: "short" })} · {names.get(v.createdBy)} · {src(v)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
