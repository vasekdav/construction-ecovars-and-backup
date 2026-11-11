import { getTranslations } from "next-intl/server";
import type { WaitingOn } from "@/lib/workflow/dependencies";

export async function WaitingText({ waiting }: { waiting: WaitingOn }) {
  const [t, tRoles] = await Promise.all([getTranslations("waiting"), getTranslations("roles")]);
  switch (waiting.kind) {
    case "dependencies":
      return <>{t("dependencies", { keys: waiting.stageKeys.join(", ") })}</>;
    case "owner":
      return <>{t("owner", { roles: waiting.roles.map((r) => tRoles(r)).join(", ") })}</>;
    case "approver":
      return <>{t("approver", { roles: waiting.roles.map((r) => tRoles(r)).join(", ") })}</>;
    case "blocked":
      return <>{t("blocked")}</>;
    case "done":
      return <>{t("done")}</>;
  }
}
