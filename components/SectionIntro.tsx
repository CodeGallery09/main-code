import type { ReactNode } from "react";
import { Appear, TextReveal } from "./motion";

type Props = {
  eyebrow: string;
  /** First line, set in upper-case sans. */
  lead: string;
  /** Second line, set in the display italic. */
  accent: string;
  lede?: ReactNode;
  align?: "left" | "center";
  id?: string;
  className?: string;
};

/**
 * The heading every section below the hero shares, in the same two-line
 * editorial form the hero uses: a mono label behind a rule, an upper-case line
 * and the display italic answering it, revealed word by word.
 *
 * It replaces four hand-rolled copies of the same markup, so the rhythm down
 * the page is set in one place.
 */
export function SectionIntro({ eyebrow, lead, accent, lede, align = "left", id, className = "" }: Props) {
  const center = align === "center";
  return (
    <div className={`${center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"} ${className}`}>
      <Appear from="up" distance={14} duration={600}>
        <p className={`sec-eyebrow ${center ? "justify-center" : ""}`}>
          <span className="sec-eyebrow-rule" aria-hidden="true" />
          {eyebrow}
        </p>
      </Appear>

      <h2 id={id} className="sec-title">
        <TextReveal text={lead} as="span" className="sec-title-caps" delay={60} step={52} />
        <TextReveal text={accent} as="em" className="sec-title-script" delay={220} step={62} />
      </h2>

      {lede && (
        <Appear from="up" delay={240} distance={16}>
          <p className={`sec-lede ${center ? "mx-auto" : ""}`}>{lede}</p>
        </Appear>
      )}
    </div>
  );
}
