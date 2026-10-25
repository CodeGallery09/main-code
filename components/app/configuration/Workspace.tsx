"use client";

/**
 * Setup · Workspace — who is in it and what plan it is on.
 *
 * This is what is left of the Settings screen. The rest of it was a mirror: a channel list that
 * ended "accounts and daily limits are managed in Configuration", a Sending card whose whole body
 * was a sentence pointing at Configuration, and a sending-domain list the Email tab already shows.
 * A screen of read-only copies of other screens is not a screen, so only the two things that were
 * genuinely its own are here.
 */

import { useEffect, useState } from "react";
import { Avatar, Meter } from "../ui";
import { api } from "@/lib/api";
import type { Workspace as WorkspaceRow } from "@/lib/data/types";

export function Workspace() {
  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { workspace: row } = await api.workspace();
      setWorkspace(row);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your workspace.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) {
    return (
      <p className="empty" role="status">
        {error}{" "}
        <button className="sortb" onClick={() => void load()}>
          Retry
        </button>
      </p>
    );
  }
  if (!workspace) return <p className="empty">Loading…</p>;

  return (
    <div className="cf-stack">
      <section className="card cf-card">
        <div className="card-h">
          <h3>Team</h3>
        </div>
        {workspace.members.map((person) => (
          <div className="chrow" key={person.id}>
            <Avatar name={person.name} />
            <div style={{ minWidth: 0 }}>
              <b>{person.name}</b>
              <small>{person.email}</small>
            </div>
            <span className="lim row" style={{ gap: 10 }}>
              <span className="tag">{person.role}</span>
            </span>
          </div>
        ))}
        <p className="empty" style={{ textAlign: "left" }}>
          Inviting teammates to this workspace isn&apos;t available yet.
        </p>
      </section>

      <section className="card cf-card">
        <div className="card-h">
          <h3>{workspace.plan} plan</h3>
          <span className="muted">{workspace.name}</span>
        </div>
        <div className="card-b cap">
          <div>
            <div className="t">
              <span>Seats</span>
              <span className="num muted">
                {workspace.seatsUsed} / {workspace.seats}
              </span>
            </div>
            <Meter value={workspace.seatsUsed} max={Math.max(workspace.seats, 1)} color="var(--accent)" />
          </div>
          <small className="muted">Billing isn&apos;t set up yet. Every workspace is on the Free plan for now.</small>
        </div>
      </section>
    </div>
  );
}
