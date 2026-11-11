import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { RuleResult } from "@/lib/rules/rule";

const STYLE: Record<RuleResult | "overridden" | "acknowledged", string> = {
  GO: "bg-go/15 text-go border-go/50",
  WARNING: "bg-warn/15 text-warn border-warn/50",
  "NO-GO": "bg-nogo/15 text-nogo border-nogo/60",
  NOT_EVALUATED: "bg-muted text-muted-foreground border-border",
  overridden: "bg-nogo/10 text-nogo border-nogo/40 line-through",
  acknowledged: "bg-warn/10 text-warn border-warn/40",
};

export async function ResultBadge({
  result,
  overridden = false,
  acknowledged = false,
}: {
  result: RuleResult;
  overridden?: boolean;
  acknowledged?: boolean;
}) {
  const t = await getTranslations("results");
  const key = result === "NO-GO" && overridden ? "overridden" : result === "WARNING" && acknowledged ? "acknowledged" : result;
  return (
    <span data-result={key} className={cn("inline-flex rounded border px-2 py-0.5 text-xs font-bold", STYLE[key])}>
      {t(key)}
    </span>
  );
}
