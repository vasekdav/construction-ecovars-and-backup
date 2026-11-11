import { inArray } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { listAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";

function short(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = JSON.stringify(value);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

export default async function AuditPage() {
  await requirePermission("audit.read");
  const db = await getDb();
  const [t, format, entries] = await Promise.all([getTranslations("audit"), getFormatter(), listAudit(db, 200)]);
  const actorIds = [...new Set(entries.map((e) => e.actorUserId).filter((v): v is string => !!v))];
  const actors = actorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds))
    : [];
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));

  return (
    <Card>
      <CardTitle>{t("title")}</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">{t("description")}</p>
      {entries.length === 0 ? (
        <p className="text-sm">{t("empty")}</p>
      ) : (
        <Table data-testid="audit-table">
          <THead>
            <Tr>
              <Th>{t("time")}</Th>
              <Th>{t("actor")}</Th>
              <Th>{t("action")}</Th>
              <Th>{t("entity")}</Th>
              <Th>{t("change")}</Th>
            </Tr>
          </THead>
          <TBody>
            {entries.map((e) => (
              <Tr key={e.id}>
                <Td className="whitespace-nowrap">
                  {format.dateTime(e.occurredAt, { dateStyle: "short", timeStyle: "medium" })}
                </Td>
                <Td>{e.actorUserId ? (nameOf.get(e.actorUserId) ?? e.actorUserId) : t("system")}</Td>
                <Td>
                  <code>{e.action}</code>
                </Td>
                <Td>
                  {e.entityType}
                  {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""}
                </Td>
                <Td className="font-mono text-xs break-all">
                  {e.before !== null && <div>− {short(e.before)}</div>}
                  {e.after !== null && <div>+ {short(e.after)}</div>}
                  {e.reason && <div>„{e.reason}“</div>}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
