import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

type Props = {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  id?: string;
};

export function SectionHeading({ eyebrow, title, lede, align = "left", id }: Props) {
  const center = align === "center";
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <Reveal>
        <p className="eyebrow">{eyebrow}</p>
      </Reveal>
      <Reveal delay={80}>
        <h2
          id={id}
          className="mt-4 font-serif text-[2.4rem] leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl md:text-[3.4rem]"
        >
          {title}
        </h2>
      </Reveal>
      {lede && (
        <Reveal delay={160}>
          <p className={`mt-5 text-[17px] leading-relaxed text-ink-2/80 ${center ? "mx-auto" : ""} max-w-xl`}>
            {lede}
          </p>
        </Reveal>
      )}
    </div>
  );
}
