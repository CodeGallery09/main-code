"use client";

import type { CSSProperties, ElementType } from "react";
import { splitWords } from "@/lib/motion/core";
import { useInViewRef } from "@/lib/motion/useMotion";

type Props = {
  /** Plain text; it is split into words so each can be masked separately. */
  text: string;
  as?: ElementType;
  /** Milliseconds before the first word moves. */
  delay?: number;
  /** Milliseconds between consecutive words. */
  step?: number;
  duration?: number;
  className?: string;
  /** Play as soon as it mounts rather than waiting to be scrolled into view. */
  immediate?: boolean;
  id?: string;
};

/**
 * Editorial headline reveal: each word rises out of its own overflow-clipped
 * line box, so the type appears to be uncovered rather than faded in.
 *
 * The words are real text in the DOM, so this is still one selectable,
 * screen-reader-readable string.
 */
export function TextReveal({
  text,
  as: Tag = "span",
  delay = 0,
  step = 55,
  duration = 900,
  className = "",
  immediate = false,
  id,
}: Props) {
  const { ref, inView } = useInViewRef<HTMLElement>({ threshold: 0.1 });
  const on = immediate || inView;
  let wordIndex = 0;

  return (
    <Tag
      ref={ref}
      id={id}
      className={`mo-text ${on ? "is-in" : ""} ${className}`}
      style={{ "--mo-duration": `${duration}ms` } as CSSProperties}
    >
      {splitWords(text).map((chunk, i) => {
        if (/^\s+$/.test(chunk)) return <span key={i}> </span>;
        const d = delay + wordIndex++ * step;
        return (
          <span key={i} className="mo-text-mask">
            <span className="mo-text-word" style={{ "--mo-delay": `${d}ms` } as CSSProperties}>
              {chunk}
            </span>
          </span>
        );
      })}
    </Tag>
  );
}
