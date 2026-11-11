import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { asLocale } from "@/lib/i18n-helpers";
import { missingParameters } from "@/lib/rules/rule";
import { listCurrentRules } from "@/lib/safety/rules-service";

export default async function RulesPage() {
  await requirePermission("project.read");
  const locale = asLocale(await getLocale());
  const [t, tRes, rules] = await Promise.all([getTranslations("rulesAdmin"), getTranslations("results"), listCurrentRules(await getDb())]);
  return (
    <Card>
      <CardTitle>{t("title")}</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">{t("description")}</p>
      <Table data-testid="rules-table">
        <THead>
          <Tr>
            <Th>{t("id")}</Th>
            <Th>{t("title_")}</Th>
            <Th>{t("media")}</Th>
            <Th>{tRes("NO-GO")} / {tRes("WARNING")}</Th>
            <Th>{t("status")}</Th>
            <Th>{t("version")}</Th>
            <Th>{t("params")}</Th>
          </Tr>
        </THead>
        <TBody>
          {rules.map(({ rule, status }) => {
            const missing = missingParameters(rule).length;
            return (
              <Tr key={rule.id} data-testid={`rule-row-${rule.id}`}>
                <Td>
                  <Link href={`/rules/${rule.id}`} className="font-mono font-semibold text-primary underline">
                    {rule.id}
                  </Link>
                </Td>
                <Td>
                  {rule.title[locale]}
                  <div className="text-xs text-muted-foreground">{rule.category}</div>
                </Td>
                <Td>{rule.appliesTo.join(", ")}</Td>
                <Td>{tRes(rule.severity)}</Td>
                <Td>
                  <Badge variant={status === "VERIFIED" ? "success" : "warning"}>{status}</Badge>
                </Td>
                <Td>{rule.version}</Td>
                <Td>
                  {rule.parameters.length === 0 ? "—" : missing ? <Badge variant="danger">{t("missing", { count: missing })}</Badge> : "✓"}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
