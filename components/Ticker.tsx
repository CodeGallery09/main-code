import { Marquee } from "./motion";

const LINES = [
  "LinkedIn + email on one clock",
  "Engagement decides the next step",
  "No duplicate touches",
  "Every workflow benchmarked",
  "Working hours and caps per account",
];

/**
 * A hairline band of running mono type, between the hero and the page.
 * It repeats what the hero already says — nothing is claimed here that is not
 * claimed above — and exists to give the page a seam the eye can land on.
 */
export function Ticker() {
  return (
    <div className="ticker" aria-hidden="true">
      <Marquee duration={54}>
        <span className="ticker-item">
          {LINES.map((l) => (
            <span key={l} className="ticker-item">
              {l}
              <span className="ticker-dot" />
            </span>
          ))}
        </span>
      </Marquee>
    </div>
  );
}
