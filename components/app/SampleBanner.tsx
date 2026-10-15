"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Tells a new workspace that the campaign and leads it starts with are invented, and offers to
 * delete them. Renders nothing once there is no sample data left, so it needs no flag from the
 * page: it asks the workspace itself.
 */
export function SampleBanner({ onRemoved }: { onRemoved?: () => void }) {
  const [counts, setCounts] = useState<{ campaigns: number; leads: number } | null>(null);
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

  if (!counts || counts.campaigns + counts.leads === 0) return null;

  async function remove() {
    if (!window.confirm("Remove the sample campaign, its workflow and the sample leads? Anything you created yourself is kept.")) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      await api.removeSampleData();
      setCounts({ campaigns: 0, leads: 0 });
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
        {counts.campaigns} sample {counts.campaigns === 1 ? "campaign" : "campaigns"} and {counts.leads} sample{" "}
        {counts.leads === 1 ? "lead" : "leads"}, with invented names and figures, so you can see how things work.
        Nothing is sent to them.{" "}
        <button type="button" className="sortb" disabled={busy} onClick={() => void remove()}>
          {busy ? "Removing…" : "Remove sample data"}
        </button>
        {failed && " Couldn't remove it — try again."}
      </span>
    </div>
  );
}
