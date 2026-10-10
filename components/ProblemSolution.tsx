import { SectionHeading } from "./SectionHeading";
import { StatusQuoStory } from "./StatusQuoStory";

export function ProblemSolution() {
  return (
    <section id="why" aria-labelledby="why-title" className="pt-24 md:pt-32">
      <div className="container-page">
        <SectionHeading
          id="why-title"
          align="center"
          eyebrow="Why Flightpath · The status quo"
          title={
            <>
              Outbound is fragmented,
              <br />
              manual, and <em className="text-[var(--alert)]">broken.</em>
            </>
          }
          lede="Scroll to see what a rep’s day actually looks like — then watch it untangle."
        />
      </div>
      <StatusQuoStory />
    </section>
  );
}
