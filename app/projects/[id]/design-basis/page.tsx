import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { asLocale } from "@/lib/i18n-helpers";
import { getQuestionnaire } from "@/lib/questionnaire/service";
import { findQuestion } from "@/lib/questionnaire/template";
import { formatNumber, unitLabel } from "@/lib/units";

export default async function DesignBasisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("project.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await getQuestionnaire(await getDb(), id);
  if (!view) notFound();
  const locale = asLocale(await getLocale());
  const nf = locale === "cs" ? "cs-CZ" : "en-GB";
  const [t, tQ, format] = await Promise.all([getTranslations("designBasis"), getTranslations("questionnaire"), getFormatter()]);
  const db = view.designBasis;
  const entries = db ? Object.entries(db.fields) : [];

  const display = (key: string): { value: string; si: string } => {
    const f = db!.fields[key]!;
    const q = findQuestion(view.template, f.source);
    if (f.quantity) {
      return {
        value: `${formatNumber(f.quantity.input, 6, nf)} ${unitLabel(f.quantity.inputUnit)}`,
        si: `${formatNumber(f.quantity.si, 6, nf)} ${unitLabel(f.quantity.siUnit)}`,
      };
    }
    if (typeof f.value === "boolean") return { value: f.value ? tQ("yes") : tQ("no"), si: "—" };
    const option = q?.options?.find((o) => o.value === f.value);
    return { value: option ? option.label[locale] : Array.isArray(f.value) ? f.value.join(", ") : String(f.value), si: "—" };
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${view.project.id}`} className="text-sm text-primary underline">
          ← {view.project.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {db && view.designBasisUpdatedAt && (
          <p className="text-xs text-muted-foreground">
            {t("generatedFrom", {
              template: db.questionnaire,
              date: format.dateTime(view.designBasisUpdatedAt, { dateStyle: "short", timeStyle: "short" }),
            })}
          </p>
        )}
      </div>
      <Card>
        <CardTitle>
          <Link href={`/projects/${view.project.id}/questionnaire`} className="text-primary underline">
            {tQ("title")}
          </Link>
        </CardTitle>
        {entries.length === 0 ? (
          <p className="text-sm">{t("empty")}</p>
        ) : (
          <Table data-testid="design-basis-table">
            <THead>
              <Tr>
                <Th>{t("field")}</Th>
                <Th>{t("value")}</Th>
                <Th>{t("si")}</Th>
                <Th>{t("source")}</Th>
              </Tr>
            </THead>
            <TBody>
              {entries.map(([key, f]) => {
                const d = display(key);
                return (
                  <Tr key={key} data-testid={`db-${key}`}>
                    <Td>
                      <code>{key}</code>
                    </Td>
                    <Td className="whitespace-pre-wrap">{d.value}</Td>
                    <Td className="whitespace-nowrap">{d.si}</Td>
                    <Td className="text-xs text-muted-foreground">
                      {findQuestion(view.template, f.source)?.label[locale]} <code>({f.source})</code>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
