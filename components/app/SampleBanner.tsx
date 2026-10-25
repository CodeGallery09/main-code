"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Tells a new workspace that the strategy and audiences it starts with are invented, and offers to
 * delete them. Renders nothing once there is no sample data left, so it needs no flag from the
 * page: it asks the workspace itself.
 */
export function SampleBanner({ onRemoved }: { onRemoved?: () => void }) {
  const [counts, setCounts] = useState<{ strategies: number; audiences: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .workspace()
      .then(({ workspace }) => live && setCounts(workspace.sample))
      .catch(() => live && setCounts(null));
    return () => {
      live = false;
    };
  }, []);

  if (!counts || counts.strategies + counts.audiences === 0) return null;

  async function remove() {
    if (!window.confirm("Remove the sample strategy, its workflow and the sample audiences? Anything you created yourself is kept.")) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      await api.removeSampleData();
      setCounts({ strategies: 0, audiences: 0 });
      onRemoved?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="warnbox" role="note" style={{ marginBottom: 14 }}>
      <b>This workspace includes sample data</b>
      <span>
        {counts.strategies} sample {counts.strategies === 1 ? "strategy" : "strategies"} and {counts.audiences} sample{" "}
        {counts.audiences === 1 ? "audience" : "audiences"}, with invented names and figures, so you can see how things work.
        Nothing is sent to them.{" "}
        <button type="button" className="sortb" disabled={busy} onClick={() => void remove()}>
          {busy ? "Removing…" : "Remove sample data"}
        </button>
        {failed && " Couldn't remove it — try again."}
      </span>
    </div>
  );
}
