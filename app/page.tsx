import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await requireUser();
  const [t, tRoles] = await Promise.all([getTranslations("home"), getTranslations("roles")]);
  return (
    <Card>
      <CardTitle>{t("welcome", { name: user.name })}</CardTitle>
      <p className="mb-2 text-sm text-muted-foreground">{t("yourRoles")}</p>
      {user.roles.length ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {user.roles.map((r) => (
            <Badge key={r}>{tRoles(r)}</Badge>
          ))}
        </div>
      ) : (
        <p className="mb-6 text-sm">{t("noRoles")}</p>
      )}
      <p className="text-sm text-muted-foreground">{t("projectsComing")}</p>
    </Card>
  );
}
