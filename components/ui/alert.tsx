import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-border bg-muted",
  success: "border-go/40 bg-go/10 text-go",
  error: "border-nogo/40 bg-nogo/10 text-nogo",
  warning: "border-warn/50 bg-warn/10",
} as const;

export function Alert({
  tone = "info",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones }) {
  return <div role="status" className={cn("rounded-md border px-4 py-3 text-sm", tones[tone], className)} {...props} />;
}
