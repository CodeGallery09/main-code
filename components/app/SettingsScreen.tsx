"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User, Workspace } from "@/lib/data/types";
import { Avatar, CHANNEL_LABEL, ChannelMark, DemoDataNote, Segmented, fmtNumber } from "@/components/app/ui";
import { LogoutIcon } from "@/components/app/icons";

export function SettingsScreen({ user, workspace }: { user: User; workspace: Workspace }) {
  const router = useRouter();
  const [tab, setTab] = useState("account");
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="space-y-3.5">
      <section className="lg lg-sheen lg-in r-xl px-4 py-3.5">
        <Segmented
          label="Settings section"
          value={tab}
          onChange={setTab}
          items={[
            { id: "account", label: "Account" },
            { id: "workspace", label: "Workspace" },
            { id: "channels", label: "Channels" },
            { id: "team", label: "Team" },
          ]}
        />
      </section>

      {tab === "account" && (
        <Panel title="Account" index={1}>
          <div className="flex items-center gap-3">
            <Avatar initials={user.initials} className="!h-12 !w-12 !text-[15px]" />
            <div>
              <p className="text-[15.5px] font-semibold text-ink">{user.name}</p>
              <p className="text-[13px] text-muted">{user.email}</p>
            </div>
          </div>
          <Rows
            rows={[
              ["Role", user.role],
              ["Time zone", user.timeZone],
              ["Sign-in", "Prototype account — one hardcoded user, no password reset yet"],
            ]}
          />
          <button type="button" className="gbtn mt-5" onClick={signOut} disabled={signingOut}>
            <LogoutIcon />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </Panel>
      )}

      {tab === "workspace" && (
        <Panel title="Workspace" index={1}>
          <Rows
            rows={[
              ["Name", workspace.name],
              ["Plan", workspace.plan],
              ["Seats", `${workspace.seatsUsed} of ${workspace.seats} used`],
            ]}
          />
          <DemoDataNote className="mt-5" />
        </Panel>
      )}

      {tab === "channels" && (
        <Panel title="Channels and daily caps" index={1}>
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            LinkedIn and email run today. The rest are planned, so their caps are shown but not used.
          </p>
          <ul className="mt-5 space-y-4">
            {workspace.quotas.map((quota) => {
              const live = workspace.liveChannels.includes(quota.channel);
              return (
                <li key={quota.channel}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
                      <ChannelMark channel={quota.channel} className="h-4 w-4 text-ink-2" />
                      {CHANNEL_LABEL[quota.channel]}
                      <span className={`pill ${live ? "pill-live" : "pill-draft"}`}>
                        {live ? "Live" : "Planned"}
                      </span>
                    </span>
                    <span className="text-[13px] tabular-nums text-muted">
                      {fmtNumber(quota.used)} / {fmtNumber(quota.cap)} today
                    </span>
                  </div>
                  <div className="meter mt-2">
                    <i style={{ "--fill": quota.used / quota.cap } as React.CSSProperties} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {tab === "team" && (
        <Panel title="Team" index={1}>
          <ul>
            {workspace.members.map((member) => (
              <li key={member.id} className="row-sep flex items-center gap-3 py-3">
                <Avatar initials={member.initials} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{member.name}</p>
                  <p className="truncate text-[12.5px] text-muted">{member.email}</p>
                </div>
                <span className="pill">{member.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[12.5px] text-muted">
            Inviting teammates needs a database, so it is not wired up in this prototype.
          </p>
        </Panel>
      )}
    </div>
  );
}

function Panel({
  title,
  index,
  children,
}: {
  title: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="lg lg-sheen lg-in r-xl max-w-3xl px-5 py-5"
      style={{ "--i": index } as React.CSSProperties}
    >
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-5">
      {rows.map(([label, value]) => (
        <div key={label} className="row-sep flex flex-wrap items-baseline justify-between gap-3 py-3">
          <dt className="text-[13.5px] text-muted">{label}</dt>
          <dd className="text-[13.5px] font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
