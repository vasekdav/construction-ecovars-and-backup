import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { authMode } from "@/lib/auth/mode";
import { can } from "@/lib/auth/rbac";
import { SignOutButton } from "./sign-out-button";

export async function AppHeader() {
  const [t, tApp, user] = await Promise.all([getTranslations("nav"), getTranslations("app"), getCurrentUser()]);
  return (
    <header className="border-b border-border bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold">
          {tApp("title")}
        </Link>
        {user && (
          <nav className="flex flex-1 flex-wrap items-center gap-4 text-sm">
            <Link href="/projects">{t("projects")}</Link>
            <Link href="/rules">{t("rules")}</Link>
            <Link href="/standards">{t("standards")}</Link>
            {can(user.roles, "user.manage") && <Link href="/admin/users">{t("users")}</Link>}
            {can(user.roles, "audit.read") && <Link href="/admin/audit">{t("audit")}</Link>}
            <span className="ml-auto opacity-80" data-testid="current-user">
              {user.name}
            </span>
            {authMode() === "password" ? (
              <SignOutButton label={t("logout")} />
            ) : (
              <span className="rounded bg-white/15 px-2 py-0.5 text-xs" data-testid="open-mode">
                {tApp("openMode")}
              </span>
            )}
          </nav>
        )}
      </div>
      <div className="bg-warn/90 px-4 py-1 text-center text-xs text-white">
        {tApp("demoData")} {authMode() === "open" && tApp("openModeNote")}
      </div>
    </header>
  );
}
