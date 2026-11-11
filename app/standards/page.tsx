import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { asLocale } from "@/lib/i18n-helpers";
import { listStandards } from "@/lib/safety/standards-service";
import { MEDIA } from "@/lib/workflow/template";
import { updateStandardAction, verifyStandardAction } from "../rules/actions";

export default async function StandardsPage() {
  const user = await requirePermission("project.read");
  const locale = asLocale(await getLocale());
  const [t, list] = await Promise.all([getTranslations("standardsAdmin"), listStandards(await getDb())]);
  const mayEdit = can(user.roles, "rule.manage");
  const mayVerify = can(user.roles, "standard.verify");
  return (
    <Card>
      <CardTitle>{t("title")}</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">{t("description")}</p>
      <ul className="space-y-3" data-testid="standards-list">
        {list.map((s) => (
          <li key={s.id} className="rounded border border-border p-3" data-testid={`standard-${s.code}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{s.code}</span>
              <span className="flex-1 text-sm">{locale === "cs" ? s.titleCs : s.titleEn}</span>
              <span className="text-xs text-muted-foreground">{s.appliesTo.join(", ")}</span>
              <Badge variant={s.status === "VERIFIED" ? "success" : "warning"}>{s.status}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-4">
              {!mayEdit && (
                <span className="text-sm text-muted-foreground">
                  {t("revision")}: {s.revision ?? "—"} {s.notes ? `· ${s.notes}` : ""}
                </span>
              )}
              {mayEdit && (
              <ActionForm action={updateStandardAction} submitLabel={t("save")} variant="outline" resetOnSuccess={false} className="flex-1">
                <input type="hidden" name="standardId" value={s.id} />
                <fieldset className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                  <Input name="revision" aria-label={`${s.code} – ${t("revision")}`} placeholder={t("revision")} defaultValue={s.revision ?? ""} maxLength={120} />
                  <Input name="notes" aria-label={`${s.code} – ${t("notes")}`} placeholder={t("notes")} defaultValue={s.notes ?? ""} maxLength={2000} />
                  <span className="flex items-center gap-3 text-sm">
                    {MEDIA.map((m) => (
                      <label key={m} className="flex items-center gap-1">
                        <input type="checkbox" name="appliesTo" value={m} defaultChecked={s.appliesTo.includes(m)} />
                        {m}
                      </label>
                    ))}
                  </span>
                </fieldset>
              </ActionForm>
              )}
              {mayVerify && s.status === "DRAFT" && (
                <ActionForm action={verifyStandardAction} submitLabel={t("verify")} successText="">
                  <input type="hidden" name="standardId" value={s.id} />
                </ActionForm>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
