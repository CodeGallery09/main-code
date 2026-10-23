"use client";

/**
 * A prospect's profile, opened from a row of the Leads table.
 *
 * Everything shown comes from `GET /api/leads/:id/profile`, which reads the prospect's own rows:
 * contact details, company (from the lead, the work email's domain and any company columns the
 * upload carried), journey (campaign and workflow run), audiences, conversations, recorded events
 * and to-dos. Where nothing is recorded the section says so; no figure is filled in for show.
 */

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { relativeTime, toChannelKey } from "@/lib/app/adapt";
import { CHANNEL } from "@/lib/app/channels";
import { STATUS_TAG } from "@/lib/app/campaigns";
import { scoreBand } from "@/lib/app/leads";
import { SENDING_ENABLED } from "@/lib/capabilities";
import { eventLabel } from "@/lib/leads/prospect";
import type { Channel, Lead, ProspectProfile, ProspectTouch } from "@/lib/data/types";
import { Avatar, Dot } from "../ui";

const RUN_LABEL: Record<NonNullable<ProspectProfile["journey"]["run"]>["state"], string> = {
  active: "In progress",
  completed: "Completed",
  stopped: "Stopped",
  failed: "Failed",
};

const INTENT_LABEL: Record<ProspectProfile["engagement"]["conversations"][number]["intent"], string> = {
  interested: "Interested",
  question: "Question",
  objection: "Objection",
  "out-of-office": "Out of office",
  "opt-out": "Opted out",
};

const channelName = (c: Channel) => CHANNEL[toChannelKey(c)].name;

function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const rel = relativeTime(iso);
  return rel === "now" ? `${day} · just now` : `${day} · ${rel} ago`;
}

export function ProspectDrawer({
  leadId,
  onClose,
  onOpen,
  onEdit,
}: {
  leadId: string;
  onClose: () => void;
  /** Opens another prospect (a colleague at the same company) in the same drawer. */
  onOpen: (id: string) => void;
  onEdit: (lead: Lead) => void;
}) {
  const [profile, setProfile] = useState<ProspectProfile | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setProfile(null);
    setError("");
    api
      .prospect(leadId)
      .then((r) => id === requestId.current && setProfile(r.profile))
      .catch((e) => {
        if (id !== requestId.current) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? "This prospect no longer exists."
            : e instanceof Error
              ? e.message
              : "Could not load this prospect.",
        );
      });
  }, [leadId]);

  // Focus moves into the drawer once, when it opens. Keyed on nothing: the parent passes a fresh
  // `onClose` every render, and refocusing on each one would pull focus off whatever the user is on.
  useEffect(() => closeRef.current?.focus(), []);

  const closeLatest = useRef(onClose);
  closeLatest.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeLatest.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lead = profile?.lead;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside
        className="drawer pf"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-title"
        aria-busy={!profile && !error}
      >
        <header className="drawer-h">
          {lead ? <Avatar name={lead.name} size="lg" /> : <span className="av lg pf-ghost" />}
          <div className="pf-who">
            <b id="pf-title">{lead ? lead.name : error ? "Prospect" : "Loading…"}</b>
            {lead && (
              <small>{[lead.title, lead.company].filter(Boolean).join(" · ") || "No title or company on file"}</small>
            )}
          </div>
          <button ref={closeRef} type="button" className="ib sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="drawer-b">
          {error && <p className="upwarn">{error}</p>}
          {!profile && !error && <p className="empty">Loading profile…</p>}
          {profile && lead && (
            <>
              <StatusRow profile={profile} />
              <Contact lead={lead} />
              <Company profile={profile} onOpen={onOpen} />
              <Journey profile={profile} />
              <Engagement profile={profile} />
              <Timeline items={profile.timeline} />
              {profile.tasks.length > 0 && <Tasks profile={profile} />}
              {profile.fileFields.length > 0 && (
                <section className="pf-sec">
                  <h3 className="eyebrow">From the uploaded file</h3>
                  <dl className="pf-kv">
                    {profile.fileFields.map((f) => (
                      <Row key={f.label} label={f.label} value={f.value} />
                    ))}
                  </dl>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="drawer-f">
          <button type="button" className="btn line" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn pri" disabled={!lead} onClick={() => lead && onEdit(lead)}>
            Edit prospect
          </button>
        </footer>
      </aside>
    </>
  );
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className={"pf-row" + (muted ? " muted" : "")}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const NOT_ON_FILE = <span className="pf-none">Not on file</span>;

function StatusRow({ profile }: { profile: ProspectProfile }) {
  const { lead } = profile;
  return (
    <div className="pf-status">
      <span className={"scoren " + scoreBand(lead.score)} title="Score">
        {lead.score}
      </span>
      <span className={"tag " + (lead.consent ? "pos" : "alert")}>
        {lead.consent ? "Consent recorded" : "No consent"}
      </span>
      {lead.isSample && <span className="tag">Sample</span>}
      <span className="pf-meta">
        Owner {lead.ownerName || "Unassigned"}
        {profile.createdAt ? ` · Added ${when(profile.createdAt)}` : ""}
      </span>
    </div>
  );
}

function Contact({ lead }: { lead: Lead }) {
  const linkedin = lead.linkedin
    ? /^https?:\/\//i.test(lead.linkedin)
      ? lead.linkedin
      : `https://${lead.linkedin}`
    : null;
  return (
    <section className="pf-sec">
      <h3 className="eyebrow">Contact</h3>
      <dl className="pf-kv">
        <Row label="Email" value={lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : NOT_ON_FILE} />
        <Row label="Mobile" value={lead.phone ? <span className="num">{lead.phone}</span> : NOT_ON_FILE} />
        <Row label="WhatsApp" value={lead.whatsapp ? <span className="num">{lead.whatsapp}</span> : NOT_ON_FILE} />
        <Row
          label="LinkedIn"
          value={
            linkedin ? (
              <a href={linkedin} target="_blank" rel="noopener noreferrer">
                {linkedin.replace(/^https?:\/\/(www\.)?/i, "")}
              </a>
            ) : (
              NOT_ON_FILE
            )
          }
        />
      </dl>
    </section>
  );
}

function Company({ profile, onOpen }: { profile: ProspectProfile; onOpen: (id: string) => void }) {
  const { company } = profile;
  const nothing = !company.name && !company.domain && !company.facts.length;
  return (
    <section className="pf-sec">
      <h3 className="eyebrow">Company</h3>
      {nothing ? (
        <p className="pf-empty">
          No company details on file. Add a company on the prospect, or upload a file with a company column.
        </p>
      ) : (
        <dl className="pf-kv">
          <Row label="Name" value={company.name || NOT_ON_FILE} />
          <Row label="Email domain" value={company.domain ?? <span className="pf-none">None (no work email)</span>} />
          {company.facts.map((f) => (
            <Row key={f.label} label={f.label} value={f.value} />
          ))}
        </dl>
      )}
      {company.colleagueCount > 0 && (
        <div className="pf-colleagues">
          <span className="hint">
            {company.colleagueCount} other {company.colleagueCount === 1 ? "prospect" : "prospects"} at {company.name}{" "}
            in this workspace
          </span>
          <ul>
            {company.colleagues.map((c) => (
              <li key={c.id}>
                <button type="button" className="pf-link" onClick={() => onOpen(c.id)}>
                  <Avatar name={c.name} />
                  <span>
                    <b>{c.name}</b>
                    {c.title && <small>{c.title}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Journey({ profile }: { profile: ProspectProfile }) {
  const { campaign, run } = profile.journey;
  return (
    <section className="pf-sec">
      <h3 className="eyebrow">Journey</h3>
      <dl className="pf-kv">
        <Row
          label="Campaign"
          value={
            campaign ? (
              <span className="pf-inline">
                {campaign.name}
                <span className={"tag " + STATUS_TAG[campaign.status].tone}>{STATUS_TAG[campaign.status].label}</span>
              </span>
            ) : (
              <span className="pf-none">Not in a campaign</span>
            )
          }
        />
        <Row
          label="Workflow run"
          value={
            run ? (
              <span>
                {RUN_LABEL[run.state]} · started {when(run.startedAt)}
                {run.finishedAt ? ` · ended ${when(run.finishedAt)}` : ""}
              </span>
            ) : (
              <span className="pf-none">No run recorded</span>
            )
          }
        />
      </dl>
      {!SENDING_ENABLED && (
        <p className="pf-note">
          Nothing is sent to this prospect automatically: sending isn’t connected yet, and importing never starts
          outreach.
        </p>
      )}
      <div className="pf-aud">
        <span className="hint">Audiences</span>
        {profile.audiences.length ? (
          <ul>
            {profile.audiences.map((a) => (
              <li key={a.id}>
                <b>{a.name}</b>
                <small>
                  {a.fileName} · imported {when(a.importedAt)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pf-empty">Not in any uploaded audience.</p>
        )}
      </div>
    </section>
  );
}

function Engagement({ profile }: { profile: ProspectProfile }) {
  const e = profile.engagement;
  const recorded = e.sent + e.received + e.events.length + e.conversations.length > 0;
  return (
    <section className="pf-sec">
      <h3 className="eyebrow">Engagement</h3>
      {!recorded ? (
        <p className="pf-empty">
          No engagement recorded yet. Messages, replies, opens and clicks appear here once they happen on a connected
          channel.
        </p>
      ) : (
        <>
          <div className="pf-stats">
            <div>
              <b className="num">{e.sent}</b>
              <small>Messages sent</small>
            </div>
            <div>
              <b className="num">{e.received}</b>
              <small>Replies</small>
            </div>
            <div>
              <b>{e.lastReplyAt ? relativeTime(e.lastReplyAt) : "—"}</b>
              <small>Last reply</small>
            </div>
            <div>
              <b>{e.lastTouchAt ? relativeTime(e.lastTouchAt) : "—"}</b>
              <small>Last activity</small>
            </div>
          </div>
          {e.byChannel.length > 0 && (
            <ul className="pf-chans">
              {e.byChannel.map((c) => (
                <li key={c.channel}>
                  <Dot k={toChannelKey(c.channel)} />
                  {channelName(c.channel)}
                  <span className="num">
                    {c.sent} sent · {c.received} {c.received === 1 ? "reply" : "replies"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {e.events.length > 0 && (
            <div className="pf-tags">
              {e.events.map((ev) => (
                <span className="segch" key={ev.kind}>
                  {eventLabel(ev.kind)} <b>{ev.count}</b>
                </span>
              ))}
            </div>
          )}
          {e.conversations.length > 0 && (
            <ul className="pf-convos">
              {e.conversations.map((c) => (
                <li key={c.id}>
                  <Dot k={toChannelKey(c.channel)} />
                  <span>
                    {channelName(c.channel)} conversation · {INTENT_LABEL[c.intent]}
                  </span>
                  {c.needsReply && <span className="tag hl">Waiting on a reply</span>}
                  <small>{relativeTime(c.lastAt)}</small>
                </li>
              ))}
            </ul>
          )}
          {e.signals.length > 0 && (
            <div className="pf-tags" aria-label="Signals">
              {e.signals.map((s) => (
                <span className="tag" key={s.label}>
                  {s.label} {s.points > 0 ? `+${s.points}` : s.points}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const TOUCH_ICON: Record<ProspectTouch["kind"], string> = {
  created: "＋",
  imported: "⇣",
  message_out: "→",
  message_in: "←",
  event: "•",
  task: "✓",
};

function Timeline({ items }: { items: ProspectTouch[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 12);
  return (
    <section className="pf-sec">
      <h3 className="eyebrow">Touchpoint history</h3>
      {items.length === 0 ? (
        <p className="pf-empty">No touchpoints recorded yet.</p>
      ) : (
        <>
          <ol className="pf-tl">
            {shown.map((t) => (
              <li key={t.id} className={"k-" + t.kind}>
                <span className="pf-tl-i" aria-hidden="true">
                  {TOUCH_ICON[t.kind]}
                </span>
                <div>
                  <span className="pf-tl-h">
                    <b>{t.label}</b>
                    {t.channel && <small>{channelName(t.channel)}</small>}
                  </span>
                  {t.detail && <p>{t.detail}</p>}
                  <time dateTime={t.at}>{when(t.at)}</time>
                </div>
              </li>
            ))}
          </ol>
          {items.length > shown.length && (
            <button type="button" className="sortb" onClick={() => setAll(true)}>
              Show all {items.length}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Tasks({ profile }: { profile: ProspectProfile }) {
  return (
    <section className="pf-sec">
      <h3 className="eyebrow">To-dos</h3>
      <ul className="pf-convos">
        {profile.tasks.map((t) => (
          <li key={t.id}>
            <Dot k={toChannelKey(t.channel)} />
            <span>{t.summary || "To-do"}</span>
            <span className={"tag " + (t.done ? "pos" : "")}>{t.done ? "Done" : t.when || "Open"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
