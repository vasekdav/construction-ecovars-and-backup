import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { authMode } from "@/lib/auth/mode";
import { getCurrentUser } from "@/lib/auth/session";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  // Open mode (ADR-039): there is nothing to sign in to.
  if (authMode() === "open") redirect("/projects");
  const { callbackUrl } = await searchParams;
  const target = safeCallbackUrl(callbackUrl);
  if (await getCurrentUser()) redirect(target);
  const t = await getTranslations("login");
  return (
    <div className="mx-auto mt-12 max-w-sm">
      <Card>
        <CardTitle>{t("title")}</CardTitle>
        <LoginForm callbackUrl={target} />
      </Card>
    </div>
  );
}
