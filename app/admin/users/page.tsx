import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { listUsers } from "@/lib/users/service";
import { CreateUserForm, EditUserForm, SetPasswordForm } from "./user-forms";

export default async function UsersPage() {
  const me = await requirePermission("user.manage");
  const [t, tRoles, users] = await Promise.all([
    getTranslations("users"),
    getTranslations("roles"),
    listUsers(await getDb()),
  ]);
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>{t("create")}</CardTitle>
        <CreateUserForm />
      </Card>
      <Card>
        <CardTitle>{t("title")}</CardTitle>
        <Table data-testid="users-table">
          <THead>
            <Tr>
              <Th>{t("name")}</Th>
              <Th>{t("email")}</Th>
              <Th>{t("roles")}</Th>
              <Th>{t("status")}</Th>
              <Th>{t("actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {users.map((u) => (
              <Tr key={u.id} data-testid={`user-row-${u.email}`}>
                <Td>
                  {u.name} {u.id === me.id && <span className="text-muted-foreground">{t("you")}</span>}
                </Td>
                <Td>{u.email}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r}>{tRoles(r)}</Badge>
                    ))}
                  </div>
                </Td>
                <Td>
                  <Badge variant={u.active ? "success" : "danger"}>{u.active ? t("active") : t("inactive")}</Badge>
                </Td>
                <Td className="min-w-72">
                  <details>
                    <summary className="cursor-pointer text-primary">{t("edit")}</summary>
                    <div className="mt-3 space-y-4">
                      <EditUserForm userId={u.id} roles={u.roles} active={u.active} />
                      <SetPasswordForm userId={u.id} />
                    </div>
                  </details>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
