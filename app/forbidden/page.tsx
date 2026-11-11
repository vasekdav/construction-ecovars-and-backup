import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";

export default async function ForbiddenPage() {
  const t = await getTranslations("forbidden");
  return (
    <Card className="mx-auto max-w-lg">
      <CardTitle>{t("title")}</CardTitle>
      <p className="mb-4 text-sm">{t("body")}</p>
      <Link href="/" className="text-sm text-primary underline">
        {t("back")}
      </Link>
    </Card>
  );
}
