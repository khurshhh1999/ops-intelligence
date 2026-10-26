import type { RiskStatus } from "@/lib/analytics";
import { STATUS_STYLE } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: RiskStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        s.bg,
        s.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {status}
    </span>
  );
}

export function FloatPill({ days, delivered }: { days: number; delivered?: boolean }) {
  if (delivered) return <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">on site</span>;
  const color = days < 0 ? "text-crit" : days <= 14 ? "text-risk" : days <= 30 ? "text-watch" : "text-ok";
  return (
    <span className={cn("font-mono text-sm tabular-nums", color)}>
      {days > 0 ? "+" : ""}
      {days}d
    </span>
  );
}
