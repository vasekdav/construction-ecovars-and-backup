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
import { Table, TBody, Td, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { calcConfigGaps } from "@/lib/calc/config";
import { AUTONOMY_KEY, getCalcConfigHistory } from "@/lib/calc/config-service";
import { asLocale } from "@/lib/i18n-helpers";
import { TBD } from "@/lib/rules/rule";
import { unitLabel, unitsFor } from "@/lib/units";
import { userNames } from "@/lib/workflow/queries";
import { updateCalcConfigAction, verifyCalcConfigAction } from "../../projects/sizing-actions";

export default async function CalcAutonomyPage() {
  const user = await requirePermission("project.read");
  const db = await getDb();
  const history = await getCalcConfigHistory(db, AUTONOMY_KEY);
  const current = history[0];
  if (!current) notFound();
  const { config } = current;
  const locale = asLocale(await getLocale());
  const nf = (v: number) => String(v).replace(".", locale === "cs" ? "," : ".");
  const [t, tR, tSafety, format, names] = await Promise.all([
    getTranslations("calcAdmin"),
    getTranslations("rulesAdmin"),
    getTranslations("safety"),
    getFormatter(),
    userNames(db, history.map((h) => h.verifiedBy)),
  ]);
  const mayEdit = can(user.roles, "rule.manage");
  const mayVerify = can(user.roles, "rule.verify") && current.status === "DRAFT";
  const gaps = calcConfigGaps(config);
  const fmt = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="space-y-6">
      <Link href="/rules" className="text-sm text-primary underline">
        {tR("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Badge variant={current.status === "VERIFIED" ? "success" : "warning"} data-testid="calc-status">
          {current.status === "DRAFT" ? tSafety("draftLabel") : "VERIFIED"}
        </Badge>
        <span className="text-sm text-muted-foreground">v{config.version}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t("description")}</p>

      <Card>
        {!mayEdit ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{tR("readOnly")}</p>
            <Table>
              <TBody>
                {config.parameters.flatMap((p) =>
                  config.appliesTo.map((m) => {
                    const q = p.values[m];
                    return (
                      <Tr key={`${p.key}-${m}`}>
                        <Td>
                          {p.label[locale]} ({m})
                        </Td>
                        <Td>{q ? `${nf(q.input)} ${unitLabel(q.inputUnit)}` : <Badge variant="danger">{TBD}</Badge>}</Td>
                      </Tr>
                    );
                  }),
                )}
              </TBody>
            </Table>
          </div>
        ) : (
          <ActionForm action={updateCalcConfigAction} submitLabel={t("save")} resetOnSuccess={false} testId="calc-edit-form">
            <div className="space-y-4">
              {config.parameters.map((p) => (
                <div key={p.key} className="space-y-2 rounded border border-border p-3">
                  <div className="font-medium">
                    {p.label[locale]} <code className="text-xs">[{p.key}]</code>
                  </div>
                  {p.note && <p className="text-xs text-muted-foreground">{p.note[locale]}</p>}
                  <div className="grid gap-3 md:grid-cols-2">
                    {config.appliesTo.map((m) => {
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
                              aria-label={`${p.key} ${m} – ${tR("unit")}`}
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
              <div className="space-y-1">
                <Label htmlFor="normal-conditions">{t("normalConditions")}</Label>
                <Input id="normal-conditions" name="normalConditions" defaultValue={config.normalConditions} required maxLength={300} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="src-doc">{tR("document")}</Label>
                  <Input id="src-doc" name="document" defaultValue={config.source.document} required maxLength={300} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="src-clause">{tR("clause")}</Label>
                  <Input id="src-clause" name="clause" defaultValue={config.source.clause} required maxLength={300} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="change-note">{tR("changeNote")}</Label>
                <Textarea id="change-note" name="changeNote" required maxLength={1000} rows={2} />
              </div>
            </div>
          </ActionForm>
        )}
      </Card>

      {mayVerify && (
        <Card>
          {gaps.length > 0 && <Alert tone="warning" className="mb-3">{tSafety("missingParams", { list: gaps.join(", ") })}</Alert>}
          <ActionForm action={verifyCalcConfigAction} submitLabel={t("verify")} successText="" testId="calc-verify-form">
            <input type="hidden" name="version" value={config.version} />
          </ActionForm>
        </Card>
      )}

      <Card>
        <CardTitle>{tR("history")}</CardTitle>
        <ul className="space-y-1 text-sm">
          {history.map((v) => (
            <li key={v.config.version}>
              v{v.config.version} · <Badge variant={v.status === "VERIFIED" ? "success" : "warning"}>{v.status}</Badge> · {fmt(v.createdAt)} ·{" "}
              {v.changeNote}
              {v.verifiedAt && ` · ${tR("verifiedBy", { name: names.get(v.verifiedBy ?? "") ?? "", date: fmt(v.verifiedAt) })}`}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
