// Tiny event bridge so sections can talk to Pip without importing the engine.

export type PipSayDetail = { text: string; ms?: number; act?: boolean };

/** Make Pip say something wherever he is (no-op on the server). */
export function pipSay(text: string, ms?: number, act?: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PipSayDetail>("pip:say", { detail: { text, ms, act } }));
}

/** While a section narrates itself (e.g. an animation is playing), Pip skips his idle skits. */
export function setPipBusy(busy: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<boolean>("pip:busy", { detail: busy }));
}
