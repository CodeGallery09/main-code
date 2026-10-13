"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Globe, Loader2, Video } from "lucide-react";
import {
  FOUNDER_FIELD_ORDER,
  FOUNDER_NAME_MAX,
  FOUNDER_TEXT_MAX,
  SLOT_FROM_MIN,
  SLOT_STEP_MIN,
  SLOT_TO_MIN,
  validateFounderCall,
  type FounderErrors,
  type FounderField,
  type FounderSubmitResponse,
} from "@/lib/demoRequest";
import { pipSay } from "@/lib/pip";
import { Reveal } from "./Reveal";

/** Months ahead the visitor can browse. */
const MAX_MONTHS = 3;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const SLOTS: number[] = [];
for (let t = SLOT_FROM_MIN; t <= SLOT_TO_MIN; t += SLOT_STEP_MIN) SLOTS.push(t);

const fmtLong = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const fmtMonth = new Intl.DateTimeFormat("en-US", { month: "long" });
const fmtWeekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });

type Values = { fullName: string; workEmail: string; pains: string; notes: string; guestEmail: string };
const EMPTY: Values = { fullName: "", workEmail: "", pains: "", notes: "", guestEmail: "" };
type Status = { kind: "idle" | "submitting" | "success" } | { kind: "error"; message: string };

async function submitFounderCall(body: object): Promise<FounderSubmitResponse> {
  try {
    const res = await fetch("/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "founder_call", ...body }),
    });
    return (await res.json()) as FounderSubmitResponse;
  } catch {
    return { ok: false, code: "delivery_failed", message: "We couldn't reach the server. Check your connection and try again." };
  }
}

export function FounderBooker() {
  // "Today" is only known on the client, so the calendar fills in after mount (no hydration mismatch).
  const [now, setNow] = useState<Date | null>(null);
  const [view, setView] = useState<Date | null>(null);
  const [selDay, setSelDay] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState<number | null>(null);
  const [h24, setH24] = useState(false);
  const [timeZone, setTimeZone] = useState("");
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FounderErrors>({});
  const [showGuest, setShowGuest] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const uid = useId();

  useEffect(() => {
    const n = new Date();
    setNow(n);
    setView(new Date(n.getFullYear(), n.getMonth(), 1));
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    } catch {
      /* time zone stays unknown */
    }
  }, []);

  const today = useMemo(() => (now ? startOfDay(now) : null), [now]);
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const isPast = (day: Date, t: number) => !!today && day.getTime() === today.getTime() && t <= nowMin;
  const dayBlocked = (day: Date) => !!today && (day < today || SLOTS.every((t) => isPast(day, t)));

  const fmtTime = (mins: number) => {
    if (h24) return hhmm(mins);
    const h = Math.floor(mins / 60);
    return `${h % 12 || 12}:${pad(mins % 60)}${h >= 12 ? "pm" : "am"}`;
  };

  const step: "pick" | "form" = selDay && selTime != null ? "form" : "pick";

  const cells = useMemo(() => {
    if (!view) return [];
    const lead = (new Date(view.getFullYear(), view.getMonth(), 1).getDay() + 6) % 7; // Monday first
    const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    return [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1))];
  }, [view]);

  const canPrev = !!view && !!today && view > new Date(today.getFullYear(), today.getMonth(), 1);
  const canNext = !!view && !!today && view < new Date(today.getFullYear(), today.getMonth() + MAX_MONTHS, 1);
  const shift = (by: number) => view && setView(new Date(view.getFullYear(), view.getMonth() + by, 1));

  const pickDay = (d: Date) => {
    setSelDay(d);
    setSelTime(null);
    pipSay("Now a time. Past times today are blocked, and I'll remind you it's only a preference.", 4200);
  };
  const pickTime = (t: number) => {
    setSelTime(t);
    setStatus({ kind: "idle" });
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[name="fullName"]')?.focus({ preventScroll: true }));
  };
  const backToCalendar = () => {
    setSelTime(null);
    setStatus({ kind: "idle" });
  };

  const validate = (v: Values, day: Date | null, time: number | null) =>
    validateFounderCall({ ...v, date: day ? dayKey(day) : "", time: time != null ? hhmm(time) : "", timeZone });

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const name = e.target.name as keyof Values;
    let value = e.target.value;
    if (name === "fullName") {
      const clean = value.replace(/[^\p{L}\p{M} .'’-]/gu, "").slice(0, FOUNDER_NAME_MAX);
      if (clean !== value && /\d/.test(value)) pipSay("Letters only in the name, please. Numbers belong in the lead count.", 4200);
      value = clean;
    }
    const next = { ...values, [name]: value };
    setValues(next);
    if (errors[name]) {
      const r = validate(next, selDay, selTime);
      setErrors((prev) => ({ ...prev, [name]: r.ok ? undefined : r.errors[name] }));
    }
    if (status.kind === "error") setStatus({ kind: "idle" });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    const r = validate(values, selDay, selTime);
    if (!r.ok) {
      setErrors(r.errors);
      const first = FOUNDER_FIELD_ORDER.find((f) => r.errors[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      pipSay("Almost! One of those boxes needs another look.", 3600);
      return;
    }
    setErrors({});
    inFlight.current = true;
    setStatus({ kind: "submitting" });
    const res = await submitFounderCall(r.data);
    inFlight.current = false;
    if (res.ok) {
      setStatus({ kind: "success" });
      pipSay("Sent! A founder will reply to confirm. Nothing is booked until they do.", 5000);
      requestAnimationFrame(() => doneRef.current?.focus());
    } else if (res.code === "invalid") {
      setErrors(res.errors);
      setStatus({ kind: "error", message: "Some details need another look." });
    } else {
      setStatus({ kind: "error", message: res.message });
    }
  };

  const err = (name: FounderField) => errors[name];
  const fid = (name: string) => `${uid}-${name}`;
  const fieldProps = (name: keyof Values) => ({
    id: fid(name),
    name,
    value: values[name],
    onChange,
    "aria-invalid": err(name) ? (true as const) : undefined,
    "aria-describedby": err(name) ? `${fid(name)}-error` : undefined,
  });
  const fieldError = (name: FounderField) =>
    err(name) ? (
      <p id={`${fid(name)}-error`} role="alert" className="field-error mt-1.5 flex items-center gap-1.5 text-[13px] text-alert">
        <AlertCircle size={13} aria-hidden="true" />
        {err(name)}
      </p>
    ) : null;

  const whenText = selDay && selTime != null ? `${fmtLong.format(selDay)}, ${fmtTime(selTime)} to ${fmtTime(selTime + SLOT_STEP_MIN)}` : "";

  return (
    <section id="founders" data-pip-section="demo" aria-labelledby="founders-title" className="py-24 md:py-32">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Book time</p>
          <h2 id="founders-title" className="display mt-4 text-[2.6rem] text-ink sm:text-6xl md:text-[3.6rem]">
            Speak with our <em>founders.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[18px] leading-relaxed text-ink-2">
            Thirty minutes, no slide deck. Suggest a time and tell us what&rsquo;s slowing your outbound down.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-12">
          <div data-pip="cta" className="glass-lg mx-auto grid max-w-[1020px] grid-cols-1 overflow-hidden md:grid-cols-[272px_minmax(0,1fr)]">
            {/* ---- left: what this is ---- */}
            <aside className="flex flex-col border-b border-line p-7 md:border-r md:border-b-0">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-[17px] font-extrabold text-white" aria-hidden="true">
                F
              </span>
              <p className="mt-4 text-[14px] font-bold text-muted">Flightpath founders</p>
              <h3 className="mt-1 font-serif text-[2rem] leading-[1.05] text-ink">Intro call</h3>
              <ul className="mt-6 space-y-3.5 text-[14.5px] text-ink-2">
                {whenText && (
                  <li className="flex items-start gap-3 font-bold text-ink">
                    <CalendarDays size={18} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden="true" />
                    <span>{whenText}</span>
                  </li>
                )}
                <li className="flex items-center gap-3">
                  <Clock size={18} className="shrink-0 text-muted" aria-hidden="true" />
                  30 minutes
                </li>
                <li className="flex items-center gap-3">
                  <Video size={18} className="shrink-0 text-muted" aria-hidden="true" />
                  Video call
                </li>
                <li className="flex items-center gap-3">
                  <Globe size={18} className="shrink-0 text-muted" aria-hidden="true" />
                  {timeZone || "Your time zone"}
                </li>
              </ul>
              <p className="mt-auto pt-8 text-[12.5px] leading-relaxed text-muted">
                Times are your preference, not a confirmed booking. A founder replies by email to confirm.
              </p>
            </aside>

            {/* ---- right: pick, then details ---- */}
            <div className="min-w-0">
              {status.kind === "success" ? (
                <div className="demo-success flex h-full flex-col items-center justify-center px-6 py-14 text-center" role="status">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
                    <Check size={22} strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  <h3 ref={doneRef} tabIndex={-1} className="mt-5 font-serif text-[2rem] leading-tight text-ink outline-none">
                    Request received.
                  </h3>
                  <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-ink-2">
                    Thanks, {values.fullName.split(" ")[0]}. We&rsquo;ll email <span className="font-bold text-ink">{values.workEmail}</span> to
                    confirm <span className="font-bold text-ink">{whenText}</span>. Nothing is booked until we reply.
                  </p>
                  <Link href="/book-demo" className="btn btn-secondary mt-8">
                    Prefer the full demo form?
                  </Link>
                </div>
              ) : step === "pick" ? (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="p-6 sm:p-7">
                    <div className="flex items-center justify-between">
                      <p className="text-[17px] font-extrabold text-ink">
                        {view ? fmtMonth.format(view) : " "} <span className="font-semibold text-muted">{view?.getFullYear()}</span>
                      </p>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month" className="bk-nav">
                          <ChevronLeft size={16} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month" className="bk-nav">
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-7 gap-1.5 text-center font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted" aria-hidden="true">
                      {DOW.map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-1.5" role="grid" aria-label="Choose a date">
                      {cells.map((d, i) => {
                        if (!d) return <span key={`e${i}`} />;
                        const blocked = dayBlocked(d);
                        const sel = !!selDay && d.getTime() === selDay.getTime();
                        const isToday = !!today && d.getTime() === today.getTime();
                        return (
                          <button
                            key={d.getDate()}
                            type="button"
                            disabled={blocked}
                            aria-pressed={sel}
                            aria-label={`${fmtLong.format(d)}${blocked ? ", unavailable" : ""}`}
                            onClick={() => pickDay(d)}
                            className={`bk-day ${sel ? "is-sel" : ""} ${isToday ? "is-today" : ""}`}
                          >
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col border-t border-line p-6 sm:p-7 lg:max-h-[470px] lg:border-t-0 lg:border-l">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[15px] font-bold text-ink">
                        {selDay ? (
                          <>
                            {fmtWeekday.format(selDay)} <span className="font-semibold text-muted">{ordinal(selDay.getDate())}</span>
                          </>
                        ) : (
                          "Pick a date"
                        )}
                      </p>
                      <div role="group" aria-label="Time format" className="inline-flex rounded-[10px] bg-surface-2 p-[3px]">
                        {[false, true].map((is24) => (
                          <button
                            key={String(is24)}
                            type="button"
                            aria-pressed={h24 === is24}
                            onClick={() => setH24(is24)}
                            className={`rounded-[8px] px-2.5 py-1 text-[12.5px] font-bold ${h24 === is24 ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
                          >
                            {is24 ? "24h" : "12h"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {selDay ? (
                      <div className="mt-4 grid gap-2 overflow-auto pr-1">
                        {SLOTS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            disabled={isPast(selDay, t)}
                            aria-label={`${fmtTime(t)}${isPast(selDay, t) ? ", already passed" : ""}`}
                            onClick={() => pickTime(t)}
                            className="bk-slot"
                          >
                            {fmtTime(t)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-[13.5px] leading-relaxed text-muted">Choose a day to see times. Past dates and times are blocked.</p>
                    )}
                  </div>
                </div>
              ) : (
                <form ref={formRef} method="post" onSubmit={onSubmit} noValidate data-pip-host className="grid content-start gap-5 p-6 sm:p-8">
                  <button type="button" onClick={backToCalendar} className="inline-flex w-fit items-center gap-1.5 rounded-full text-[13.5px] font-bold text-ink-2 hover:text-accent-ink">
                    <ArrowLeft size={15} aria-hidden="true" />
                    Change time
                  </button>

                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <label htmlFor={fid("fullName")} className="text-[14px] font-bold text-ink">
                        Your name <span className="text-alert">*</span>
                      </label>
                      <span className="font-mono text-[11px] text-muted">
                        {values.fullName.length}/{FOUNDER_NAME_MAX}
                      </span>
                    </div>
                    <input
                      {...fieldProps("fullName")}
                      type="text"
                      maxLength={FOUNDER_NAME_MAX}
                      autoComplete="name"
                      spellCheck={false}
                      data-explain="Your full name. Letters only, up to 50 characters. Example: Maya Reyes"
                      className="field"
                    />
                    {fieldError("fullName")}
                  </div>

                  <div>
                    <label htmlFor={fid("workEmail")} className="mb-1.5 block text-[14px] font-bold text-ink">
                      Work email <span className="text-alert">*</span>
                    </label>
                    <input
                      {...fieldProps("workEmail")}
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      spellCheck={false}
                      data-explain="Your work email, so we know where to confirm the time. Example: maya@yourcompany.com"
                      className="field"
                    />
                    {fieldError("workEmail")}
                  </div>

                  <div>
                    <label htmlFor={fid("pains")} className="mb-1.5 block text-[14px] font-bold text-ink">
                      What are your main pains? <span className="text-alert">*</span>
                    </label>
                    <textarea
                      {...fieldProps("pains")}
                      rows={3}
                      maxLength={FOUNDER_TEXT_MAX}
                      data-explain="What is slowing your outbound down? A sentence or two is plenty."
                      className="field resize-y"
                    />
                    {fieldError("pains")}
                  </div>

                  <div>
                    <label htmlFor={fid("notes")} className="mb-1.5 block text-[14px] font-bold text-ink">
                      Anything else to add? <span className="font-medium text-muted">(optional)</span>
                    </label>
                    <textarea
                      {...fieldProps("notes")}
                      rows={2}
                      maxLength={FOUNDER_TEXT_MAX}
                      placeholder="Anything that will help us prepare for the call."
                      data-explain="Optional. Anything that helps us prepare, like team size or who you sell to."
                      className="field resize-y"
                    />
                    {fieldError("notes")}
                  </div>

                  {showGuest ? (
                    <div>
                      <label htmlFor={fid("guestEmail")} className="mb-1.5 block text-[14px] font-bold text-ink">
                        Guest email <span className="font-medium text-muted">(optional)</span>
                      </label>
                      <input
                        {...fieldProps("guestEmail")}
                        type="email"
                        inputMode="email"
                        spellCheck={false}
                        data-explain="Want a teammate on the call? Add their email."
                        className="field"
                      />
                      {fieldError("guestEmail")}
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowGuest(true)} className="w-fit rounded-[10px] px-2 py-1.5 text-[14px] font-bold text-ink-2 hover:bg-surface-2">
                      + Add a guest
                    </button>
                  )}

                  {status.kind === "error" && (
                    <p role="alert" className="field-error flex items-start gap-2 rounded-[12px] border border-alert/30 bg-alert-soft px-3.5 py-3 text-[14px] text-alert">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {status.message}
                    </p>
                  )}

                  <button type="submit" disabled={status.kind === "submitting"} className="btn btn-primary w-full disabled:opacity-70">
                    {status.kind === "submitting" ? (
                      <>
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Request this time
                        <ArrowRight size={16} className="btn-arrow" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
