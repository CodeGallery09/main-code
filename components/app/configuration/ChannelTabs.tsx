"use client";

/**
 * Configuration · the five channel tabs.
 *
 * Each one is the same shape: the accounts or numbers that send, then the
 * reusable content (sequences, templates, scripts), then the rules that apply
 * across the channel. LinkedIn and email are the channels the product runs
 * today; WhatsApp, Calls and SMS carry the planned note Integrations uses,
 * because the UI never offers a connection the product cannot honour.
 */

import { useState } from "react";
import { CHANNEL } from "@/lib/app/channels";
import {
  CALLER_IDS,
  CALL_DIALER,
  CALL_OUTCOMES,
  CALL_RECORDING,
  CALL_SCRIPTS,
  EMAIL_FOOTER,
  EMAIL_SEQUENCES,
  EMAIL_TRACKING,
  LINKEDIN_ACCOUNT_RULES,
  LINKEDIN_CAPS,
  LINKEDIN_NUMBER_RULES,
  LINKEDIN_SEATS,
  LINKEDIN_SEQUENCES,
  MAILBOXES,
  OUTCOME_ACTIONS,
  SENDING_DOMAINS,
  SMS_CONFIRMATION,
  SMS_OPT_OUT_KEYWORDS,
  SMS_QUIET_HOURS,
  SMS_SENDER,
  SMS_TEMPLATES,
  VOICEMAILS,
  WHATSAPP_NUMBER,
  WHATSAPP_RULES,
  WHATSAPP_TEMPLATES,
  domainVerified,
  type CallScript,
  type Sequence,
} from "@/lib/app/configuration";
import { Avatar, Segmented, Switch } from "../ui";
import { CheckIcon, Glyph } from "../icons";
import {
  DemoNote,
  Issue,
  Panel,
  PlannedNote,
  Row,
  Stepper,
  TileFigure,
  TileLabel,
  TileLimit,
  ToggleRowView,
  useToggles,
} from "./parts";

/* ========== LinkedIn ====================================================== */

export function LinkedInTab() {
  const [sub, setSub] = useState<"accounts" | "sequences">("accounts");
  const rules = useToggles(LINKEDIN_ACCOUNT_RULES);
  const [numbers, setNumbers] = useState(() =>
    Object.fromEntries(LINKEDIN_NUMBER_RULES.map((r) => [r.id, r.value])),
  );

  return (
    <div className="cf-stack">
      <Segmented
        value={sub}
        onChange={setSub}
        items={[
          ["accounts", "Accounts & limits"],
          ["sequences", "Sequences"],
        ]}
      />

      {sub === "accounts" ? (
        <>
          <div className="cf-cardgrid">
            {LINKEDIN_SEATS.map((seat) => (
              <Seat key={seat.id} seat={seat} />
            ))}
          </div>

          <Panel
            title="All accounts"
            sub="Account-level limits and sequence behaviour that apply across every LinkedIn seat"
          >
            {LINKEDIN_ACCOUNT_RULES.slice(0, 2).map((r) => (
              <ToggleRowView key={r.id} {...r} on={rules.on[r.id]} onChange={rules.toggle} />
            ))}
            {LINKEDIN_NUMBER_RULES.map((r) => (
              <Row key={r.id} label={r.label} hint={r.hint}>
                <span className="row" style={{ gap: 8 }}>
                  <Stepper
                    value={numbers[r.id]}
                    max={r.max}
                    onChange={(v) => setNumbers((n) => ({ ...n, [r.id]: v }))}
                  />
                  {r.unit && <span className="muted">{r.unit}</span>}
                </span>
              </Row>
            ))}
            {LINKEDIN_ACCOUNT_RULES.slice(2).map((r) => (
              <ToggleRowView key={r.id} {...r} on={rules.on[r.id]} onChange={rules.toggle} />
            ))}
          </Panel>
        </>
      ) : (
        <SequenceCards
          channel="LinkedIn"
          sequences={LINKEDIN_SEQUENCES}
          metric="reply"
        />
      )}

      <DemoNote />
    </div>
  );
}

function Seat({ seat }: { seat: (typeof LINKEDIN_SEATS)[number] }) {
  const out = seat.state === "signed_out";
  const [limits, setLimits] = useState({
    connections: seat.connections,
    messages: seat.messages,
    visits: seat.visits,
  });
  const set = (k: keyof typeof limits) => (v: number) => setLimits((l) => ({ ...l, [k]: v }));

  return (
    <section className="card cf-tile">
      <div className="cf-tileh">
        <Avatar name={seat.name} size="sm" />
        <span className="cf-tilename">
          <b>{seat.name}</b>
          <span className={"tag " + (out ? "alert" : "pos")}>{out ? "Log in again" : "Healthy"}</span>
        </span>
        <button type="button" className={"btn xs " + (out ? "pri" : "ghost")}>
          {out ? "Reconnect" : "Pause"}
        </button>
      </div>

      <a className="cf-liprofile" href={`https://${seat.profile}`} target="_blank" rel="noreferrer">
        <i className="cdot" style={{ background: CHANNEL.li.hex }} />
        {seat.profile}
      </a>

      {out && <Issue>Signed out — steps paused until it reconnects</Issue>}

      <div className="cf-tilegrid">
        <TileLimit
          label="Connections"
          unit="/day"
          hint="LinkedIn caps invites around 100 a week"
          value={limits.connections}
          onChange={set("connections")}
          max={LINKEDIN_CAPS.connections}
          safe={25}
        />
        <TileLimit
          label="Messages"
          unit="/day"
          hint="To first-degree connections"
          value={limits.messages}
          onChange={set("messages")}
          max={LINKEDIN_CAPS.messages}
          safe={80}
        />
        <TileLimit
          label="Visits"
          unit="/day"
          value={limits.visits}
          onChange={set("visits")}
          max={LINKEDIN_CAPS.visits}
          safe={100}
        />
        <TileFigure label="InMail" unit="left" value={seat.inmail ?? "—"} />
      </div>
    </section>
  );
}

/** The sequence cards LinkedIn shows, and the table email and calls show. */
function SequenceCards({
  channel,
  sequences,
  metric,
}: {
  channel: string;
  sequences: Sequence[];
  metric: string;
}) {
  return (
    <Panel
      title={`${channel} sequences`}
      sub={`Reusable ${channel} sequences. Campaigns pick one; edits become a new version.`}
      action={
        <button type="button" className="btn sm pri">
          New sequence
        </button>
      }
    >
      <div className="cf-cardgrid">
        {sequences.map((s) => (
          <article className="card cf-tile" key={s.id}>
            <div className="cf-tileh">
              <span className="cf-tilename">
                <b>{s.name}</b>
                <span className={"tag " + (s.status === "live" ? "pos" : "")}>
                  {s.status === "live" ? "Live" : "Draft"}
                </span>
              </span>
              {s.status === "live" && <span className="tag">v{s.version}</span>}
            </div>
            <span className="cf-tilesub">{s.steps.join(" → ")}</span>
            <div className="cf-tilegrid">
              <TileFigure label="Steps" value={s.steps.length} />
              <TileFigure label={metric} unit="rate" value={s.rate == null ? "—" : `${s.rate}%`} />
              <div className="cf-list cf-span2">
                <TileLabel label="Used by" />
                <span className="cf-tilesub" style={{ marginTop: 0 }}>
                  {s.usedBy.length ? s.usedBy.join(", ") : "Unused"} · edited {s.edited}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

/* ========== Email ========================================================= */

export function EmailTab() {
  const [sub, setSub] = useState<"mailboxes" | "sequences" | "tracking">("mailboxes");

  return (
    <div className="cf-stack">
      <Segmented
        value={sub}
        onChange={setSub}
        items={[
          ["mailboxes", "Mailboxes & domains"],
          ["sequences", "Sequences"],
          ["tracking", "Tracking & footer"],
        ]}
      />

      {sub === "mailboxes" && <Mailboxes />}
      {sub === "sequences" && (
        <SequenceCards channel="Email" sequences={EMAIL_SEQUENCES} metric="reply" />
      )}
      {sub === "tracking" && <Tracking />}

      <DemoNote />
    </div>
  );
}

function Mailboxes() {
  const [caps, setCaps] = useState(() =>
    Object.fromEntries(MAILBOXES.map((m) => [m.address, m.cap])),
  );
  const [rotate, setRotate] = useState(() =>
    Object.fromEntries(MAILBOXES.map((m) => [m.address, m.rotate])),
  );

  return (
    <>
      <Panel
        title="Sending domains"
        sub="Open and click tracking are on by default for every domain the moment it's connected."
      >
        <div className="cf-cardgrid">
          {SENDING_DOMAINS.map((d) => {
            const ok = domainVerified(d);
            return (
              <article className="card cf-tile" key={d.host}>
                <div className="cf-tileh">
                  <span className="cf-tilename">
                    <b className="cf-domname mono">{d.host}</b>
                  </span>
                  {ok ? (
                    <span className="tag pos">Verified</span>
                  ) : (
                    <button type="button" className="btn sm pri">
                      Check DNS
                    </button>
                  )}
                </div>
                <div className="cf-chips">
                  {(["spf", "dkim", "dmarc"] as const).map((rec) => (
                    <span className={"tag " + (d[rec] ? "pos" : "alert")} key={rec}>
                      {d[rec] && <CheckIcon />}
                      {rec.toUpperCase()}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Mailboxes"
        sub="Sending is spread across them with rotation on; keep each under 60/day for cold email."
        action={
          <button type="button" className="btn sm line">
            Add mailbox
          </button>
        }
      >
        <div className="cf-cardgrid">
          {MAILBOXES.map((m) => (
            <article className="card cf-tile" key={m.address}>
              <div className="cf-tileh">
                <span className="cf-mbico">
                  <Glyph n="mail" />
                </span>
                <span className="cf-tilename">
                  <b>{m.address}</b>
                  <span className={"tag " + (m.state === "warm" ? "pos" : "hl")}>
                    {m.state === "warm" ? "Warm" : "Warming"}
                  </span>
                </span>
              </div>
              <span className="cf-tilesub">
                {m.provider}
                {m.warmDay ? ` · day ${m.warmDay}/14` : ""}
              </span>

              <div className="cf-tilegrid">
                <div className="cf-list">
                  <TileLabel label="Health" unit="/100" />
                  <b className={"cf-tilenum num" + (m.health < 80 ? " cf-bad" : "")}>{m.health}</b>
                </div>
                <TileLimit
                  label="Daily cap"
                  value={caps[m.address]}
                  onChange={(v) => setCaps((c) => ({ ...c, [m.address]: v }))}
                  max={120}
                  safe={60}
                  hint="Keep each mailbox under 60/day for cold email"
                />
                <div className="cf-list cf-span2 row" style={{ justifyContent: "space-between" }}>
                  <TileLabel label="Rotate into sending pool" />
                  <Switch
                    on={rotate[m.address]}
                    label={`Rotate ${m.address}`}
                    onChange={() => setRotate((r) => ({ ...r, [m.address]: !r[m.address] }))}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}

function Tracking() {
  const tracking = useToggles(EMAIL_TRACKING);
  const footer = useToggles(EMAIL_FOOTER);
  const [retries, setRetries] = useState(2);

  return (
    <>
      <Panel title="Tracking">
        {EMAIL_TRACKING.map((r) => (
          <ToggleRowView key={r.id} {...r} on={tracking.on[r.id]} onChange={tracking.toggle} />
        ))}
      </Panel>

      <Panel title="Footer & unsubscribe">
        {EMAIL_FOOTER.map((r) => (
          <ToggleRowView key={r.id} {...r} on={footer.on[r.id]} onChange={footer.toggle} />
        ))}
      </Panel>

      <Panel title="Bounces">
        <Row label="Hard bounce">
          <span className="tag">Stop &amp; suppress</span>
        </Row>
        <Row label="Retry soft bounces">
          <span className="row" style={{ gap: 8 }}>
            <Stepper value={retries} max={5} onChange={setRetries} />
            <span className="muted">times</span>
          </span>
        </Row>
      </Panel>
    </>
  );
}

/* ========== WhatsApp ===================================================== */

export function WhatsAppTab() {
  const [sub, setSub] = useState<"templates" | "number" | "rules">("templates");
  const rules = useToggles(WHATSAPP_RULES);
  const n = WHATSAPP_NUMBER;

  return (
    <div className="cf-stack">
      <PlannedNote channel="WhatsApp" />

      <Segmented
        value={sub}
        onChange={setSub}
        items={[
          ["templates", "Templates"],
          ["number", "Number & quality"],
          ["rules", "Conversation rules"],
        ]}
      />

      {sub === "templates" && (
        <Panel
          title="Message templates"
          sub="Business-initiated WhatsApp messages must use a Meta-approved template. Review usually takes under 24 hours."
          action={
            <button type="button" className="btn sm pri" disabled title="WhatsApp is not connected yet">
              New template
            </button>
          }
        >
          <div className="tblw">
            <table className="tbl cf-tbl inner">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Language</th>
                  <th className="r">Read rate</th>
                  <th className="r">Campaigns</th>
                </tr>
              </thead>
              <tbody>
                {WHATSAPP_TEMPLATES.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <div className="cf-sm">
                        <b className="mono">{t.name}</b>
                        <small className="cf-ell">{t.body}</small>
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          "tag " +
                          (t.status === "approved" ? "pos" : t.status === "review" ? "hl" : "alert")
                        }
                      >
                        {t.status === "approved" ? "Approved" : t.status === "review" ? "In review" : "Rejected"}
                      </span>
                    </td>
                    <td>{t.category}</td>
                    <td>{t.language}</td>
                    <td className="r num">{t.read == null ? "—" : `${t.read}%`}</td>
                    <td className="r num">{t.campaigns ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {sub === "number" && (
        <Panel title="Business number">
          <Row label={n.name} hint={`${n.number} · ${n.via}`}>
            <span className="tag pos">
              <CheckIcon />
              Verified business
            </span>
          </Row>
          <Row label="Quality rating" hint="Based on blocks and reports over the last 7 days">
            <span className="cf-q">
              <i />
              <i />
              <i />
              <b>{n.quality}</b>
            </span>
          </Row>
          <Row
            label="Messaging limit"
            hint={`New conversations you can start per 24 hours. Next tier ${n.nextTier.toLocaleString("en-US")} · reach 50% of your limit for 7 days at High quality.`}
          >
            <span className="num">
              {n.started.toLocaleString("en-US")} / {n.limit.toLocaleString("en-US")} today
            </span>
          </Row>
        </Panel>
      )}

      {sub === "rules" && (
        <Panel title="Conversation rules">
          {WHATSAPP_RULES.map((r) => (
            <ToggleRowView key={r.id} {...r} on={rules.on[r.id]} onChange={rules.toggle} />
          ))}
        </Panel>
      )}

      <DemoNote />
    </div>
  );
}

/* ========== Calls ======================================================== */

export function CallsTab() {
  const [sub, setSub] = useState<"scripts" | "dialer" | "outcomes">("scripts");

  return (
    <div className="cf-stack">
      <PlannedNote channel="Calling" />

      <Segmented
        value={sub}
        onChange={setSub}
        items={[
          ["scripts", "Scripts"],
          ["dialer", "Dialer & recording"],
          ["outcomes", "Call outcomes"],
        ]}
      />

      {sub === "scripts" && <Scripts />}
      {sub === "dialer" && <Dialer />}
      {sub === "outcomes" && <Outcomes />}

      <DemoNote />
    </div>
  );
}

function Scripts() {
  return (
    <Panel
      title="Call scripts"
      sub="What reps see on screen during a call. Versioned like sequences."
      action={
        <button type="button" className="btn sm pri" disabled title="Calling is not connected yet">
          New script
        </button>
      }
    >
      <div className="tblw">
        <table className="tbl cf-tbl inner">
          <thead>
            <tr>
              <th>Script</th>
              <th>Status</th>
              <th>Used by</th>
              <th className="r">Connect → meeting</th>
              <th className="r">Edited</th>
            </tr>
          </thead>
          <tbody>
            {CALL_SCRIPTS.map((s: CallScript) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                </td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <span className={"tag " + (s.status === "live" ? "pos" : "")}>
                      {s.status === "live" ? "Live" : "Draft"}
                    </span>
                    {s.version != null && <span className="tag">v{s.version}</span>}
                  </span>
                </td>
                <td className="muted">{s.usedBy.length ? s.usedBy.join(", ") : "—"}</td>
                <td className="r num">{s.rate == null ? "—" : `${s.rate}%`}</td>
                <td className="r muted">{s.edited}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Dialer() {
  const dialer = useToggles(CALL_DIALER);
  const recording = useToggles(CALL_RECORDING);
  const [callerId, setCallerId] = useState(CALLER_IDS[0]);
  const [voicemail, setVoicemail] = useState(VOICEMAILS[0]);
  const [attempts, setAttempts] = useState(3);
  const [gap, setGap] = useState(2);

  return (
    <>
      <Panel title="Dialer">
        <Row label="Caller ID">
          <select
            className="sel cf-in"
            aria-label="Caller ID"
            value={callerId}
            onChange={(e) => setCallerId(e.target.value)}
          >
            {CALLER_IDS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Row>
        {CALL_DIALER.map((r) => (
          <ToggleRowView key={r.id} {...r} on={dialer.on[r.id]} onChange={dialer.toggle} />
        ))}
        <Row label="Attempts per lead">
          <Stepper value={attempts} max={10} onChange={setAttempts} />
        </Row>
        <Row label="Days between attempts">
          <Stepper value={gap} max={30} onChange={setGap} />
        </Row>
        <Row label="Calling hours" hint="Calls only run inside this window, in the lead's own time zone">
          <span className="num">9:00–21:00 lead&rsquo;s time</span>
        </Row>
      </Panel>

      <Panel title="Recording & voicemail">
        {CALL_RECORDING.map((r) => (
          <ToggleRowView key={r.id} {...r} on={recording.on[r.id]} onChange={recording.toggle} />
        ))}
        <Row label="Voicemail message">
          <select
            className="sel cf-in"
            aria-label="Voicemail message"
            value={voicemail}
            onChange={(e) => setVoicemail(e.target.value)}
          >
            {VOICEMAILS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Row>
      </Panel>
    </>
  );
}

function Outcomes() {
  const [actions, setActions] = useState(() => CALL_OUTCOMES.map(([, action]) => action));

  return (
    <Panel
      title="What happens after each call"
      sub="Reps pick an outcome; the campaign reacts on its own"
      action={
        <button type="button" className="btn sm line">
          Add outcome
        </button>
      }
    >
      {CALL_OUTCOMES.map(([outcome], i) => (
        <div className="cf-out" key={outcome}>
          <b>{outcome}</b>
          <span className="muted" aria-hidden="true">
            →
          </span>
          <select
            className="sel"
            aria-label={`After "${outcome}"`}
            value={actions[i]}
            onChange={(e) =>
              setActions((a) => a.map((v, j) => (j === i ? e.target.value : v)))
            }
          >
            {OUTCOME_ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
      ))}
    </Panel>
  );
}

/* ========== SMS ========================================================== */

export function SmsTab() {
  const [sub, setSub] = useState<"templates" | "sender" | "optout">("templates");

  return (
    <div className="cf-stack">
      <PlannedNote channel="SMS" />

      <Segmented
        value={sub}
        onChange={setSub}
        items={[
          ["templates", "Templates"],
          ["sender", "Sender & DLT"],
          ["optout", "Opt-out"],
        ]}
      />

      {sub === "templates" && (
        <Panel
          title="SMS templates"
          sub="In India every SMS must match a template registered on the DLT portal. Paste its template ID here."
          action={
            <button type="button" className="btn sm pri" disabled title="SMS is not connected yet">
              New template
            </button>
          }
        >
          <div className="tblw">
            <table className="tbl cf-tbl inner">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Status</th>
                  <th>DLT template ID</th>
                  <th className="r">Parts</th>
                </tr>
              </thead>
              <tbody>
                {SMS_TEMPLATES.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <div className="cf-sm">
                        <b>{t.name}</b>
                        <small className="cf-ell">{t.body}</small>
                      </div>
                    </td>
                    <td>
                      <span className={"tag " + (t.status === "approved" ? "pos" : "hl")}>
                        {t.status === "approved" ? "Approved" : "In review"}
                      </span>
                    </td>
                    <td className={"mono" + (t.dlt ? "" : " muted")}>{t.dlt ?? "Not registered"}</td>
                    <td className="r num">{t.parts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {sub === "sender" && <SmsSender />}
      {sub === "optout" && <SmsOptOut />}

      <DemoNote />
    </div>
  );
}

function SmsSender() {
  return (
    <>
      <Panel title="India · DLT" sub="TRAI requires a registered entity, sender ID and templates">
        <Row label="Principal entity ID">
          <input className="inp cf-in mono" defaultValue={SMS_SENDER.entityId} aria-label="Principal entity ID" />
        </Row>
        <Row label="Entity status">
          <span className="row" style={{ gap: 8 }}>
            <span className="tag alert">Not verified</span>
            <button type="button" className="btn sm pri">
              Verify
            </button>
          </span>
        </Row>
        <Row label="Sender ID (header)" hint="6 letters, registered on DLT">
          <input className="inp cf-in sm mono" defaultValue={SMS_SENDER.header} aria-label="Sender ID" />
        </Row>
      </Panel>

      <Panel title="United States · 10DLC">
        <Row label="Brand & campaign registration">
          <span className="tag pos">Approved</span>
        </Row>
        <Row label="Sending number">
          <span className="num">{SMS_SENDER.us.number}</span>
        </Row>
      </Panel>
    </>
  );
}

function SmsOptOut() {
  const [keywords, setKeywords] = useState(SMS_OPT_OUT_KEYWORDS);
  const [draft, setDraft] = useState("");

  return (
    <Panel title="Opt-out">
      <Row
        label="Opt-out keywords"
        hint="A reply with any of these unsubscribes the number everywhere"
      >
        <div className="cf-kw">
          {keywords.map((k) => (
            <span className="tag" key={k}>
              {k}
              <button
                type="button"
                aria-label={`Remove ${k}`}
                onClick={() => setKeywords((list) => list.filter((x) => x !== k))}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="inp"
            aria-label="Add keyword"
            placeholder="Add"
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                setKeywords((list) => Array.from(new Set([...list, draft.trim()])));
                setDraft("");
              }
            }}
          />
        </div>
      </Row>
      <Row label="Confirmation message">
        <input
          className="inp cf-in wide"
          defaultValue={SMS_CONFIRMATION}
          aria-label="Confirmation message"
        />
      </Row>
      <Row label="Quiet hours" hint="No texts between these times in the lead's time zone">
        <span className="row" style={{ gap: 8 }}>
          <input className="inp cf-in sm" type="time" defaultValue={SMS_QUIET_HOURS.from} aria-label="From" />
          <span className="muted">to</span>
          <input className="inp cf-in sm" type="time" defaultValue={SMS_QUIET_HOURS.until} aria-label="Until" />
        </span>
      </Row>
    </Panel>
  );
}
