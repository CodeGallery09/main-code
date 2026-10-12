"use client";

import { useMemo, useState } from "react";
import {
  FOUNDER_TEXT_MAX,
  SLOT_FROM_MIN,
  SLOT_STEP_MIN,
  SLOT_TO_MIN,
  validateFounderCall,
  type FounderErrors,
  type FounderSubmitResponse,
} from "@/lib/demoRequest";

/** Every 30-minute start a founder call can be requested for. */
const SLOTS = (() => {
  const out: string[] = [];
  for (let m = SLOT_FROM_MIN; m <= SLOT_TO_MIN; m += SLOT_STEP_MIN) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The next 12 weekdays, starting tomorrow. */
function upcomingWeekdays() {
  const days: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < 12) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) days.push(new Date(cursor));
  }
  return days;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Preferred-time request for a founder call. Nothing is booked here: the form
 * sends a preference and a founder confirms by email, which is what the copy
 * says and what /api/demo-request records.
 */
export function FounderCall() {
  // Read on the client so the server render carries no date-dependent markup.
  const days = useMemo(upcomingWeekdays, []);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [pains, setPains] = useState("");
  const [notes, setNotes] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [errors, setErrors] = useState<FounderErrors>({});
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [problem, setProblem] = useState("");

  const timeZone = typeof Intl === "undefined" ? "" : Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setProblem("");

    const payload = { kind: "founder_call", fullName, workEmail, pains, notes, guestEmail, date, time, timeZone };
    // Validated with the same function the route handler uses.
    const check = validateFounderCall(payload);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setState("sending");

    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as FounderSubmitResponse;
      if (body.ok) {
        setState("sent");
        return;
      }
      setState("idle");
      if (body.code === "invalid") setErrors(body.errors);
      else setProblem(body.message);
    } catch {
      setState("idle");
      setProblem("That didn’t send. Check your connection and try again.");
    }
  }

  if (state === "sent") {
    return (
      <section id="founders" data-pip-section="demo" aria-labelledby="founders-title" className="sect">
        <div className="wrap">
          <div className="card feat" style={{ padding: 28 }}>
            <span className="eyebrow">Request sent</span>
            <h3 id="founders-title">Thanks — a founder will email you to confirm.</h3>
            <p>
              We have your preferred slot. Nothing is in a calendar yet; you will get an email at {workEmail} with a
              confirmed time.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="founders" data-pip-section="demo" aria-labelledby="founders-title" className="sect">
      <div className="wrap">
        <div className="sect-h">
          <span className="eyebrow">Book time</span>
          <h2 id="founders-title">
            Speak with <em>our founders.</em>
          </h2>
          <p>
            Thirty minutes, no slide deck. Tell us what is slowing your outbound down and suggest a time that suits
            you.
          </p>
        </div>

        <div className="duo">
          <article className="card feat" style={{ padding: 24 }}>
            <span className="eyebrow">Intro call</span>
            <h3>30 minutes · video call</h3>
            <p>
              Times below are your preference, not a confirmed booking. A founder replies by email to confirm.
              {timeZone ? ` Times are in ${timeZone}.` : ""}
            </p>
            <ul className="sigs" style={{ marginTop: 6 }}>
              <li>
                <span>What we will ask</span>
                <span className="p">3 questions</span>
              </li>
              <li>
                <span>Who joins</span>
                <span className="p">A founder</span>
              </li>
              <li>
                <span>Reply time</span>
                <span className="p">Same day</span>
              </li>
            </ul>
          </article>

          <form className="card feat" style={{ padding: 24, gap: 16 }} onSubmit={submit} noValidate>
            <div className="fld">
              <span className="flabel">Preferred day</span>
              <div className="days">
                {days.map((d) => {
                  const value = iso(d);
                  return (
                    <button
                      type="button"
                      key={value}
                      className={date === value ? "on" : ""}
                      aria-pressed={date === value}
                      onClick={() => setDate(value)}
                    >
                      {DAY_NAMES[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
                    </button>
                  );
                })}
              </div>
              {errors.date && <span className="hint" style={{ color: "var(--alert)" }}>{errors.date}</span>}
            </div>

            <div className="fld">
              <span className="flabel">Preferred time</span>
              <div className="days">
                {SLOTS.map((slot) => (
                  <button
                    type="button"
                    key={slot}
                    className={time === slot ? "on" : ""}
                    aria-pressed={time === slot}
                    onClick={() => setTime(slot)}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              {errors.time && <span className="hint" style={{ color: "var(--alert)" }}>{errors.time}</span>}
            </div>

            <div className="fld">
              <label htmlFor="fc-name">Your name</label>
              <input
                id="fc-name"
                className="inp"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
              {errors.fullName && <span className="hint" style={{ color: "var(--alert)" }}>{errors.fullName}</span>}
            </div>

            <div className="fld">
              <label htmlFor="fc-email">Work email</label>
              <input
                id="fc-email"
                className="inp"
                type="email"
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                autoComplete="email"
              />
              {errors.workEmail && <span className="hint" style={{ color: "var(--alert)" }}>{errors.workEmail}</span>}
            </div>

            <div className="fld">
              <label htmlFor="fc-pains">What is slowing your outbound down?</label>
              <textarea
                id="fc-pains"
                className="ta"
                maxLength={FOUNDER_TEXT_MAX}
                value={pains}
                onChange={(e) => setPains(e.target.value)}
              />
              {errors.pains && <span className="hint" style={{ color: "var(--alert)" }}>{errors.pains}</span>}
            </div>

            <div className="fld">
              <label htmlFor="fc-guest">Guest email (optional)</label>
              <input
                id="fc-guest"
                className="inp"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
              {errors.guestEmail && <span className="hint" style={{ color: "var(--alert)" }}>{errors.guestEmail}</span>}
            </div>

            <div className="fld">
              <label htmlFor="fc-notes">Anything else (optional)</label>
              <input
                id="fc-notes"
                className="inp"
                value={notes}
                maxLength={FOUNDER_TEXT_MAX}
                onChange={(e) => setNotes(e.target.value)}
              />
              {errors.notes && <span className="hint" style={{ color: "var(--alert)" }}>{errors.notes}</span>}
            </div>

            {problem && (
              <p className="hint" style={{ color: "var(--alert)" }} role="alert">
                {problem}
              </p>
            )}

            <button className="btn pri" type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Request this time"}
            </button>
            <span className="hint">Nothing is booked until a founder confirms by email.</span>
          </form>
        </div>
      </div>
    </section>
  );
}
