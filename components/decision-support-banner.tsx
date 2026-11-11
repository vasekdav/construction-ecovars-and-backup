import { getTranslations } from "next-intl/server";

/** SPEC §0.6, §8, §11.10: shown on every screen with rule-check output. */
export async function DecisionSupportBanner() {
  const t = await getTranslations("app");
  return (
    <div
      role="note"
      data-testid="decision-support-banner"
      className="rounded-md border-2 border-warn bg-warn/10 px-4 py-3 text-sm font-semibold"
    >
      ⚠ {t("disclaimer")}
    </div>
  );
}
