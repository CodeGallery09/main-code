/**
 * How the screens hear about a newly saved segment.
 *
 * The upload modal lives in the app shell and the segment list lives on the
 * Audiences screen, so a save in one has to reach the other. There is no client
 * store in the prototype, so the shell announces the save on `window` and
 * whoever is showing segments reloads. A real app would do this through its
 * data layer.
 */

import type { Segment } from "@/lib/audiences/segments";

const EVENT = "flightpath:segment-saved";

export function segmentSaved(segment: Segment) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: segment }));
}

export function onSegmentSaved(handler: (segment: Segment) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<Segment>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
