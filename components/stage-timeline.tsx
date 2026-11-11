import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { StageState } from "@/lib/workflow/types";
import { STATE_STYLES } from "./stage-state-badge";

/** Traffic-light axis of the project steps (SPEC §8). */
export async function StageTimeline({
  projectId,
  stages,
  compact = false,
}: {
  projectId: string;
  stages: { key: string; state: StageState; title: string }[];
  compact?: boolean;
}) {
  const t = await getTranslations("states");
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="timeline">
      {stages.map((s) => (
        <li key={s.key}>
          <Link
            href={`/projects/${projectId}/stages/${s.key}`}
            title={`${s.key} · ${s.title} · ${t(s.state)}`}
            data-testid={`stage-pill-${s.key}`}
            data-state={s.state}
            className={cn(
              "flex items-center justify-center rounded border font-semibold",
              compact ? "h-7 min-w-7 px-1 text-xs" : "h-10 min-w-10 px-2 text-sm",
              STATE_STYLES[s.state],
            )}
          >
            {s.key}
          </Link>
        </li>
      ))}
    </ol>
  );
}
