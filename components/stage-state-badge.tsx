import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { StageState } from "@/lib/workflow/types";

export const STATE_STYLES: Record<StageState, string> = {
  NOT_STARTED: "bg-muted text-muted-foreground border-border",
  IN_PROGRESS: "bg-sky-100 text-sky-900 border-sky-300",
  IN_REVIEW: "bg-warn/15 text-warn border-warn/50",
  CLOSED: "bg-go/15 text-go border-go/50",
  BLOCKED: "bg-nogo/15 text-nogo border-nogo/50",
};

export async function StageStateBadge({ state }: { state: StageState }) {
  const t = await getTranslations("states");
  return (
    <span className={cn("inline-flex rounded border px-2 py-0.5 text-xs font-semibold", STATE_STYLES[state])}>
      {t(state)}
    </span>
  );
}
