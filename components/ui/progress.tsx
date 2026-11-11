import { cn } from "@/lib/utils";

export function Progress({ value, label, testId }: { value: number; label: string; testId?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="space-y-1" data-testid={testId}>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{v} %</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full", v === 100 ? "bg-go" : "bg-primary")} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
