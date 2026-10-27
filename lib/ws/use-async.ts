"use client";

import { useCallback, useEffect, useState } from "react";

export type Async<T> =
  | { state: "loading"; data: null; error: null }
  | { state: "ready"; data: T; error: null }
  | { state: "failed"; data: null; error: string };

/**
 * One request, with the three states every card on these screens has to show:
 * loading (keep the layout), ready, and failed (with a retry that doesn't
 * reload the page). `deps` re-runs the request; `reload` repeats it.
 */
export function useAsync<T>(run: () => Promise<T>, deps: readonly unknown[]): Async<T> & { reload: () => void } {
  const [result, setResult] = useState<Async<T>>({ state: "loading", data: null, error: null });
  const [nonce, setNonce] = useState(0);

  // The caller passes a fresh closure each render; the dependency list is what decides.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useCallback(run, deps);

  useEffect(() => {
    let live = true;
    setResult({ state: "loading", data: null, error: null });
    request()
      .then((data) => live && setResult({ state: "ready", data, error: null }))
      .catch((error: unknown) =>
        live
          ? setResult({
              state: "failed",
              data: null,
              error: error instanceof Error ? error.message : "That didn't load.",
            })
          : undefined,
      );
    return () => {
      live = false;
    };
  }, [request, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...result, reload };
}
