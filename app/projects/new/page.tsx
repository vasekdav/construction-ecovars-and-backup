import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { listActiveUsers } from "@/lib/workflow/queries";
import { MEDIA } from "@/lib/workflow/template";
import { createProjectAction } from "../actions";

export default async function NewProjectPage() {
  await requirePermission("project.create");
  const [t, tMedium, users] = await Promise.all([
    getTranslations("projects"),
    getTranslations("medium"),
    listActiveUsers(await getDb()),
  ]);
  const oams = users.filter((u) => u.roles.includes("OAM"));
  return (
    <Card className="mx-auto max-w-2xl">
      <CardTitle>{t("new")}</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">{t("fictitious")}</p>
      <ActionForm action={createProjectAction} submitLabel={t("create")} size="default" testId="new-project-form" resetOnSuccess={false}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="p-name">{t("name")}</Label>
            <Input id="p-name" name="name" required maxLength={160} placeholder="Demo Zákazník, LOX 20 m³" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-customer">{t("customer")}</Label>
            <Input id="p-customer" name="customer" required maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-location">{t("location")}</Label>
            <Input id="p-location" name="location" required maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-medium">{t("medium")}</Label>
            <Select id="p-medium" name="medium" required defaultValue="O2">
              {MEDIA.map((m) => (
                <option key={m} value={m}>
                  {tMedium(m)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-owner">{t("owner")}</Label>
            <Select id="p-owner" name="ownerUserId" defaultValue="">
              <option value="">{t("ownerSelf")}</option>
              {oams.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{t("ownerHint")}</p>
          </div>
        </div>
      </ActionForm>
    </Card>
  );
}
