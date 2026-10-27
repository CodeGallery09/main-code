import * as React from "react";
import { cn } from "@/lib/ws/utils";

/** White surface, 1px border, 12px radius, no shadow. Surfaces separate by line, never by lift. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-xl border border-border bg-card text-foreground", className)} {...props} />;
}

/** Header strip with a bottom divider. Title left, actions right. */
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border px-[18px] py-[14px]",
        className,
      )}
      {...props}
    />
  );
}

/** Mono section heading. */
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("font-mono text-[14.5px] font-bold tracking-[-0.01em]", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-[12.5px] text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-[18px] py-[14px]", className)} {...props} />;
}

/** A row inside a card. Rows divide with the lighter --divider line. */
export function CardRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-3 border-b border-divider py-[13px] last:border-b-0", className)}
      {...props}
    />
  );
}
