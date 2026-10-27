"use client";

import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { THUMB } from "./motion";
import { cn } from "@/lib/ws/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Segmented filter — the pill-track control used for To do, strategy status,
 * template kinds and builder pace. Each segment is a real button carrying
 * aria-pressed; the white thumb is a shared-layout element so it slides
 * between options instead of blinking.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  disabled,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const track = useId();
  const still = useReducedMotion();

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex flex-wrap items-center gap-[2px] rounded-lg bg-secondary p-[3px]", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex items-center gap-[6px] rounded-sm px-[11px] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
              size === "sm" ? "h-[26px] text-[12.5px]" : "h-[28px] text-[12.5px]",
              on ? "font-medium text-foreground" : "text-[#5b5852] hover:text-foreground",
            )}
          >
            <AnimatePresence initial={false}>
              {on && (
                <motion.span
                  aria-hidden
                  layoutId={still ? undefined : `${track}-thumb`}
                  className="absolute inset-0 rounded-sm bg-card shadow-[0_1px_2px_rgba(20,20,19,0.08)]"
                  transition={THUMB}
                />
              )}
            </AnimatePresence>
            <span className="relative">{o.label}</span>
            {o.count !== undefined && (
              <span className={cn("relative font-mono text-[11px]", on ? "text-body" : "text-muted-foreground")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
