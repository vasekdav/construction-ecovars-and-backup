import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { asLocale } from "@/lib/i18n-helpers";
import { describe } from "@/lib/rules/expr";
import { missingParameters, TBD } from "@/lib/rules/rule";
import { INPUT_CATALOG } from "@/lib/safety/input-catalog";
import { getRuleHistory } from "@/lib/safety/rules-service";
import { unitLabel, unitsFor } from "@/lib/units";
import { userNames } from "@/lib/workflow/queries";
import { updateRuleAction, verifyRuleAction } from "../actions";

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("project.read");
  if (!/^R-[A-Z0-9]+-\d{2}$/.test(id)) notFound();
  const db = await getDb();
  const history = await getRuleHistory(db, id);
  const current = history[0];
  if (!current) notFound();
  const { rule } = current;
  const locale = asLocale(await getLocale());
  const nf = (n: number) => String(n).replace(".", locale === "cs" ? "," : ".");
  const [t, tSafety, tRes, format] = await Promise.all([
    getTranslations("rulesAdmin"),
    getTranslations("safety"),
    getTranslations("results"),
    getFormatter(),
  ]);
  const names = await userNames(db, history.map((h) => h.verifiedBy));
  const mayEdit = can(user.roles, "rule.manage");
  const mayVerify = can(user.roles, "rule.verify") && current.status === "DRAFT";
  const missing = missingParameters(rule);
  const fmt = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <Link href="/rules" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          <span className="font-mono">{rule.id}</span> · {rule.title[locale]}
        </h1>
        <Badge variant={current.status === "VERIFIED" ? "success" : "warning"} data-testid="rule-status">
          {current.status === "DRAFT" ? tSafety("draftLabel") : "VERIFIED"}
        </Badge>
        <span className="text-sm text-muted-foreground">
          v{rule.version} · {rule.category} · {rule.appliesTo.join(", ")} · {tRes(rule.severity)} · {tSafety("stages")}: {rule.stages.join(", ")}
        </span>
      </div>
      {current.status === "VERIFIED" && current.verifiedAt && (
        <Alert tone="success">{t("verifiedBy", { name: names.get(current.verifiedBy ?? "") ?? "", date: fmt(current.verifiedAt) })}</Alert>
      )}

      <Card className="space-y-3 text-sm">
        <p className="font-medium">{rule.message[locale]}</p>
        <p>
          <span className="font-semibold">{tSafety("remediation")}:</span> {rule.remediation[locale]}
        </p>
        <div>
          <div className="text-xs font-semibold text-muted-foreground">{tSafety("condition")}</div>
          <code className="text-xs break-all">{describe(rule.condition)}</code>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground">{tSafety("inputs")}</div>
          <ul className="list-disc pl-5">
            {rule.inputs.map((i) => (
              <li key={i.key}>
                {i.label[locale]} <code className="text-xs">({i.key})</code>
                {INPUT_CATALOG[i.key]?.where === "sizing" && <Badge className="ml-2">fáze 4</Badge>}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-muted-foreground">
          {tSafety("source")}: {rule.source.document} · {rule.source.clause}
        </div>
      </Card>

      <Card>
        <CardTitle>{t("edit")}</CardTitle>
        {!mayEdit && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
            <ul className="space-y-1 text-sm" data-testid="rule-params-readonly">
              {rule.parameters.map((p) =>
                rule.appliesTo.map((m) => {
                  const q = p.values[m];
                  return (
                    <li key={`${p.key}-${m}`}>
                      {p.label[locale]} ({m}): {q ? `${nf(q.input)} ${unitLabel(q.inputUnit)}` : <Badge variant="danger">{TBD}</Badge>}
                    </li>
                  );
                }),
              )}
            </ul>
          </div>
        )}
        {mayEdit && (
        <ActionForm action={updateRuleAction} submitLabel={t("save")} resetOnSuccess={false} testId="rule-edit-form">
          <input type="hidden" name="ruleId" value={rule.id} />
          <fieldset className="space-y-4">
            {rule.parameters.map((p) => (
              <div key={p.key} className="space-y-2 rounded border border-border p-3">
                <div className="font-medium">
                  {p.label[locale]} <code className="text-xs">[{p.key}]</code>
                </div>
                {p.note && <p className="text-xs text-muted-foreground">{p.note[locale]}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  {rule.appliesTo.map((m) => {
                    const q = p.values[m];
                    return (
                      <div key={m} className="space-y-1">
                        <Label htmlFor={`p-${p.key}-${m}`}>
                          {m} {!q && <Badge variant="danger">{TBD}</Badge>}
                        </Label>
                        <div className="flex gap-2">
                          <Input id={`p-${p.key}-${m}`} name={`p:${p.key}:${m}`} inputMode="decimal" defaultValue={q ? nf(q.input) : ""} />
                          <Select
                            name={`pu:${p.key}:${m}`}
                            aria-label={`${p.key} ${m} – ${t("unit")}`}
                            defaultValue={q?.inputUnit ?? unitsFor(p.dimension)[0]}
                            className="w-32"
                          >
                            {unitsFor(p.dimension).map((u) => (
                              <option key={u} value={u}>
                                {unitLabel(u)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="src-doc">{t("document")}</Label>
                <Input id="src-doc" name="document" defaultValue={rule.source.document} required maxLength={300} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="src-clause">{t("clause")}</Label>
                <Input id="src-clause" name="clause" defaultValue={rule.source.clause} required maxLength={300} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="change-note">{t("changeNote")}</Label>
              <Textarea id="change-note" name="changeNote" required maxLength={1000} rows={2} />
            </div>
          </fieldset>
        </ActionForm>
        )}
      </Card>

      {mayVerify && (
        <Card>
          {missing.length > 0 && <Alert tone="warning" className="mb-3">{tSafety("missingParams", { list: missing.join(", ") })}</Alert>}
          <ActionForm action={verifyRuleAction} submitLabel={t("verify")} successText="" testId="rule-verify-form">
            <input type="hidden" name="ruleId" value={rule.id} />
            <input type="hidden" name="version" value={rule.version} />
          </ActionForm>
        </Card>
      )}

      <Card>
        <CardTitle>{t("history")}</CardTitle>
        <Table>
          <THead>
            <Tr>
              <Th>{t("version")}</Th>
              <Th>{t("status")}</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {history.map((h) => (
              <Tr key={h.rule.version}>
                <Td>v{h.rule.version}</Td>
                <Td>
                  <Badge variant={h.status === "VERIFIED" ? "success" : "warning"}>{h.status}</Badge>
                </Td>
                <Td className="text-xs">
                  {fmt(h.createdAt)} · {h.changeNote ?? ""}
                  {h.verifiedAt && ` · ${t("verifiedBy", { name: names.get(h.verifiedBy ?? "") ?? "", date: fmt(h.verifiedAt) })}`}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
