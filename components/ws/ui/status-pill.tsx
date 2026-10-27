import { cn } from "@/lib/ws/utils";

export type PillTone = "success" | "info" | "neutral" | "warning" | "danger";

const TONES: Record<PillTone, { wrap: string; dot: string }> = {
  success: { wrap: "bg-success-bg text-success", dot: "bg-success" },
  info: { wrap: "bg-info-bg text-info", dot: "bg-info" },
  neutral: { wrap: "bg-accent text-body", dot: "bg-faint" },
  warning: { wrap: "bg-warning-bg text-warning", dot: "bg-warning" },
  danger: { wrap: "bg-destructive-bg text-destructive", dot: "bg-destructive" },
};

/**
 * Status is never colour-only: the pill always carries its label.
 * Pass the label as children ("Live", "Signed out", "Needs a DNS record").
 */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-medium",
        t.wrap,
        className,
      )}
    >
      <span aria-hidden className={cn("size-[5px] rounded-full", t.dot)} />
      {children}
    </span>
  );
}

/** The four states a strategy can be in on screen. */
export type PillStatus = "live" | "scheduled" | "paused" | "draft" | "completed";

const STRATEGY: Record<PillStatus, { tone: PillTone; label: string }> = {
  live: { tone: "success", label: "Live" },
  scheduled: { tone: "info", label: "Scheduled" },
  paused: { tone: "neutral", label: "Paused" },
  draft: { tone: "neutral", label: "Draft" },
  completed: { tone: "neutral", label: "Finished" },
};

export function StrategyStatusPill({ status }: { status: PillStatus }) {
  const m = STRATEGY[status];
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}
