/* =====================================================================
   Pip: lives inside the page. Scrolling takes him to each section, where
   he explains it. Stand still for ~5s and he does something silly.
   Ported from references/home-terracotta-v9.html. Everything is imperative
   (one rAF loop writing transforms) so React never re-renders per frame.
   Sections opt in with `data-pip-section="<id>"`; see SECTIONS below.
   ===================================================================== */
import type { PipSayDetail } from "@/lib/pip";

type SpotKind = "screen" | "abs" | "top" | "under" | "floor";
type Spot = { kind: SpotKind; sel?: string; idx?: number; el?: Element | null; at?: number; fx?: number; fy?: number; sink?: number };
type Line = string | { t: string; act?: boolean };
type Item = Spot & { line: Line; fallback?: Spot };
type Section = { id: string; el: string; items: Item[] };
type Pending = { rej: (e: unknown) => void; t?: ReturnType<typeof setTimeout>; raf?: number; cancel?: () => void };
type Act = { id: string; top?: boolean; run: () => Promise<void> };
type Pos = { x: number; y: number; a: number };

const CANCEL = { cancel: true };
const sec = (id: string) => `[data-pip-section="${id}"]`;

/* ---- per-section perches and explanations ---- */
const SECTIONS: Section[] = [
  { id: "hero", el: sec("hero"), items: [
    { sel: "[data-hcard]", idx: 0, kind: "top", at: 0.5, line: "Hi! I'm Pip, resident bird of this site. These cards are sample data from one workflow." },
    { sel: "[data-hcard]", idx: 3, kind: "top", at: 0.5, line: "Engagement score: past 70, a human steps in. Scroll and watch the cards line up." },
    { sel: "[data-hcard]", idx: 5, kind: "top", at: 0.5, line: "Zero duplicate touches. LinkedIn and email run on one clock." },
  ] },
  { id: "journey", el: sec("journey"), items: [
    { sel: "#journey-card", kind: "top", at: 0.9, fallback: { kind: "screen", fx: 0.06 }, line: "Meet Maya, a sample lead. Pick how she responds and watch her route change." },
  ] },
  { id: "why", el: sec("why"), items: [
    { sel: '[data-why="today"]', kind: "top", at: 0.85, line: "Today: five tools, five clocks, twelve tabs. Does your Monday look like this?" },
    { sel: '[data-why="flightpath"]', kind: "top", at: 0.85, line: "With Flightpath they collapse into one workflow with one clock. Deep breath." },
  ] },
  { id: "flow", el: sec("flow"), items: [
    { sel: ".pl-node", kind: "top", at: 0.9, line: "Leads, channels and signals, all routed to one place. That's the whole pipeline." },
  ] },
  { id: "how", el: sec("how"), items: [
    { sel: "#wf-canvas", kind: "top", at: 0.92, line: "The workflow library. Pick a template and I'll run it, node by node." },
    { sel: "[data-wf-step]", idx: 3, kind: "top", at: 0.5, line: "The IF node routes by behaviour, not by a timer. That's the whole trick." },
  ] },
  { id: "demo", el: sec("demo"), items: [
    { sel: '[data-pip="cta"]', kind: "floor", at: 0.1, fallback: { kind: "screen", fx: 0.92 }, line: { t: "That's the tour! Want this running on your own leads?", act: true } },
  ] },
  { id: "book-intro", el: sec("book-intro"), items: [
    { sel: '[data-pip="book-flow"]', kind: "top", at: 0.92, line: "LinkedIn, then email, then a signal decides the next action. That's the whole idea." },
  ] },
  { id: "book-form", el: sec("book-form"), items: [
    { sel: "#book-form-card", kind: "top", at: 0.92, line: "Tell us about your team. I'll cheer you on while you type." },
  ] },
  { id: "foot", el: "footer", items: [{ kind: "screen", fx: 0.9, line: "You made it to the bottom! I live here. Come back anytime." }] },
];

const JOKES = [
  "Why did the lead ghost? Step 4 fired anyway.",
  "Cold outreach? I prefer “room-temperature outreach”.",
  "I'm not a cloud bird. CRM sync is still “Planned”.",
  "I run entirely on sample data. Very low calorie.",
  "My engagement score is 76. Route me to a call.",
  "I asked my sequence for a break. It replied in 3 days, on a timer.",
  "Fun fact: I have never once opened a tab.",
  "Again? Fine. Hold my goggles.",
];
const CHEER = ["Yes! Keep typing!", "Look at those keystrokes!", "That's a great email. (I can't see it, but I believe.)", "Almost there! Don't stop now!", "Form? Crushed.", "Who's a good typer? You are!"];
const POSES = ["walk", "stumble", "sleep", "fallen", "yoga", "dance", "cheer", "hop", "spin", "hover", "pop", "dropped"];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function angleOfEl(el: Element) {
  const m = getComputedStyle(el).transform;
  if (!m || m === "none") return 0;
  const v = m.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!v) return 0;
  const p = v[1].split(",").map(parseFloat);
  return Math.atan2(p[1], p[0]);
}

export type PipHandle = { dispose: () => void; routeChanged: () => void };

export function startPip(root: HTMLElement): PipHandle {
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  const pip = q<HTMLElement>(".pip");
  const pipFly = q<HTMLElement>(".pip-fly");
  const pipBtn = q<HTMLButtonElement>(".pip-body");
  const bubble = q<HTMLElement>(".pip-bubble");
  const bText = q<HTMLElement>("[data-pip-text]");
  const live = q<HTMLElement>("[data-pip-live]");
  const pL = q<SVGGElement>("#pupilL");
  const pR = q<SVGGElement>("#pupilR");
  const fx = q<HTMLElement>(".glassfx");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const disposers: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(t: Window | Document | HTMLElement, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
    t.addEventListener(type, fn as EventListener, opts);
    disposers.push(() => t.removeEventListener(type, fn as EventListener, opts));
  };

  let VW = window.innerWidth;
  let VH = window.innerHeight;
  const P = {
    S: 76,
    pos: { x: VW * 1.1, y: VH * 0.5 },
    rot: 0,
    spot: { kind: "screen", fx: 1.1 } as Spot,
    base: { kind: "screen", fx: 0.92 } as Spot,
    mode: "spot" as "spot" | "flight" | "free",
    flight: null as null | { x0: number; y0: number; t0: number; dur: number; arc: number; done: () => void },
    free: null as null | { x: number; y: number; vy: number; vx: number; r: number; vr: number; bounced: boolean; floor: number; done: () => void },
    run: 0,
    pending: [] as Pending[],
    idleT: 0 as ReturnType<typeof setTimeout> | 0,
    sec: null as Section | null,
    said: {} as Record<string, 1>,
    resetSaid: false,
    explaining: false,
    recent: [] as string[],
    cheer: false,
    busy: false,
    pointer: { x: -1, y: -1 },
    bubbleT: 0 as ReturnType<typeof setTimeout> | 0,
    scrollT: 0 as ReturnType<typeof setTimeout> | 0,
    last: 0,
    lastInput: 0,
    lastSpeak: 0,
    nap: null as null | { t: number; res: () => void },
    raf: 0,
  };
  const gone = () => pip.classList.contains("gone");
  const measure = () => { VW = window.innerWidth; VH = window.innerHeight; P.S = pipBtn.offsetWidth || 76; };
  measure();

  /* ---- where can he stand? ---- */
  function sel(sp: Spot) {
    if (sp.sel && (!sp.el || !sp.el.isConnected)) sp.el = document.querySelectorAll(sp.sel)[sp.idx || 0] || null;
    return sp.el || null;
  }
  const spotId = (sp: Spot) => sp.kind + "|" + (sp.sel || "") + "#" + (sp.idx || 0);
  function spotPos(sp: Spot): Pos | null {
    const S = P.S, foot = S * 0.93;
    if (sp.kind === "screen") return { x: (sp.fx ?? 0.92) * VW - S / 2, y: VH - foot - 3, a: 0 };
    if (sp.kind === "abs") return { x: (sp.fx ?? 0.5) * VW - S / 2, y: (sp.fy ?? 0.5) * VH - S / 2, a: 0 };
    const el = sel(sp);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const w = (el as HTMLElement).offsetWidth || r.width, h = (el as HTMLElement).offsetHeight || r.height;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, a = angleOfEl(el);
    const dx = ((sp.at == null ? 0.5 : sp.at) - 0.5) * w;
    const dy = sp.kind === "top" ? -h / 2 : sp.kind === "under" ? h / 2 + 4 : h / 2 - 12;
    const x = cx + dx * Math.cos(a) - dy * Math.sin(a), y = cy + dx * Math.sin(a) + dy * Math.cos(a);
    if (sp.kind === "under") return { x: x - S / 2, y, a: 0 };
    return { x: x - S / 2, y: y - foot + (sp.sink || 0), a: (a * 180) / Math.PI };
  }
  const visibleSpot = (sp: Spot) => {
    const p = spotPos(sp);
    return !!p && p.y > 74 && p.y < VH - P.S * 0.6 && p.x > -P.S * 0.3 && p.x < VW - P.S * 0.7;
  };
  const getAt = (sp: Spot) => (sp.kind === "screen" ? sp.fx ?? 0.92 : sp.at ?? 0.5);
  const setAt = (sp: Spot, v: number) => { if (sp.kind === "screen") sp.fx = v; else sp.at = v; };

  function dominant(): Section | null {
    const y = VH * 0.6;
    let best: Section | null = null;
    for (const s of SECTIONS) {
      const node = document.querySelector(s.el);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) return s;
      if (r.top < VH) best = s;
    }
    return best;
  }

  /* ---- cancellable timing helpers ---- */
  const rm = (it: Pending) => { const i = P.pending.indexOf(it); if (i >= 0) P.pending.splice(i, 1); };
  function wait(ms: number) {
    return new Promise<void>((res, rej) => {
      const it: Pending = { rej };
      it.t = setTimeout(() => { rm(it); res(); }, ms);
      P.pending.push(it);
    });
  }
  function tween(ms: number, fn: (t: number) => void) {
    return new Promise<void>((res, rej) => {
      const it: Pending = { rej };
      const t0 = performance.now();
      P.pending.push(it);
      const step = (now: number) => {
        const t = clamp((now - t0) / ms, 0, 1);
        fn(t);
        if (t < 1) it.raf = requestAnimationFrame(step); else { rm(it); res(); }
      };
      step(t0);
      it.cancel = () => cancelAnimationFrame(it.raf || 0);
    });
  }
  function cancelAct() {
    P.run++;
    P.pending.splice(0).forEach((it) => {
      if (it.t) clearTimeout(it.t);
      if (it.cancel) it.cancel();
      try { it.rej(CANCEL); } catch { /* already settled */ }
    });
    if (P.idleT) clearTimeout(P.idleT);
    P.idleT = 0; P.nap = null;
    if (P.mode === "free") { P.free = null; P.mode = "spot"; P.spot = { kind: "screen", fx: (P.pos.x + P.S / 2) / VW }; }
    resetVisuals();
  }
  function resetVisuals() {
    POSES.forEach((c) => pip.classList.remove(c));
    pip.dataset.prop = "";
    pipFly.style.clipPath = "";
    pip.style.setProperty("--bx", "0px");
    pip.style.setProperty("--by", "0px");
  }
  const pose = (c: string, onOff?: boolean) => pip.classList.toggle(c, onOff === undefined ? true : !!onOff);
  const prop = (s?: string) => { pip.dataset.prop = s || ""; };

  /* ---- speech ---- */
  function speak(text: string, ms?: number, act?: boolean, announce?: boolean) {
    if (gone()) return;
    bText.textContent = text;
    bubble.classList.toggle("has-act", !!act);
    bubble.classList.add("show");
    if (announce) live.textContent = text;
    if (P.bubbleT) clearTimeout(P.bubbleT);
    P.bubbleT = setTimeout(() => { bubble.classList.remove("show"); bubble.classList.remove("has-act"); }, ms || 4200);
  }

  /* ---- movement: flight, walking, falling ---- */
  function fly(spot: Spot, ms?: number, arc?: number) {
    return new Promise<void>((res, rej) => {
      P.spot = spot;
      if (reduce || gone()) { P.mode = "spot"; res(); return; }
      const it: Pending = { rej };
      P.pending.push(it);
      P.mode = "flight";
      pip.classList.add("fly");
      P.flight = { x0: P.pos.x, y0: P.pos.y, t0: performance.now(), dur: ms || 900, arc: arc == null ? 80 : arc, done: () => { rm(it); res(); } };
    });
  }
  const flyQuiet = (spot: Spot, ms?: number, arc?: number) => { fly(spot, ms, arc).catch(() => {}); };
  const walk = (to: number, ms: number) => { const a = getAt(P.spot); return tween(ms, (t) => setAt(P.spot, lerp(a, to, ease(t)))); };
  function fall() {
    return new Promise<void>((res, rej) => {
      const it: Pending = { rej };
      P.pending.push(it);
      P.mode = "free";
      pip.classList.remove("walk");
      P.free = { x: P.pos.x, y: P.pos.y, vy: 0, vx: 1.6, r: P.rot, vr: 7, bounced: false, floor: VH - P.S * 0.93 - 3, done: () => { rm(it); res(); } };
    });
  }

  /* ---- frame loop: he is always standing on something ---- */
  function frame(now: number) {
    P.raf = requestAnimationFrame(frame);
    if (gone()) return;
    const dt = Math.min(2.5, (now - (P.last || now)) / 16.67);
    P.last = now;
    if (P.mode === "free" && P.free) {
      const f = P.free;
      f.vy += 0.9 * dt; f.y += f.vy * dt; f.x += f.vx * dt; f.r += f.vr * dt;
      if (f.y >= f.floor) {
        f.y = f.floor;
        if (!f.bounced) { f.bounced = true; f.vy = -f.vy * 0.38; f.vr *= 0.4; f.vx *= 0.5; }
        else {
          P.spot = { kind: "screen", fx: clamp((f.x + P.S / 2) / VW, 0.03, 0.97) };
          P.mode = "spot"; P.free = null; P.rot = 0;
          pose("fallen", true); f.done();
          return;
        }
      }
      P.pos.x = f.x; P.pos.y = f.y; P.rot = f.r;
    } else {
      const tgt = spotPos(P.spot) || spotPos({ kind: "screen", fx: 0.92 })!;
      if (P.mode === "flight" && P.flight) {
        const fl = P.flight, t = clamp((now - fl.t0) / fl.dur, 0, 1), e = ease(t);
        P.pos.x = lerp(fl.x0, tgt.x, e);
        P.pos.y = lerp(fl.y0, tgt.y, e) - Math.sin(Math.PI * e) * fl.arc;
        P.rot = clamp((tgt.x - fl.x0) * 0.02, -16, 16) * Math.sin(Math.PI * e) + tgt.a * e;
        if (t >= 1) { P.mode = "spot"; P.flight = null; pip.classList.remove("fly"); fl.done(); }
      } else {
        P.pos.x = tgt.x; P.pos.y = tgt.y; P.rot = tgt.a;
        /* carried out of view by scrolling? head for the screen floor */
        if ((P.spot.kind === "top" || P.spot.kind === "floor") && (tgt.y < -P.S * 0.8 || tgt.y > VH + P.S * 0.2)) {
          P.base = { kind: "screen", fx: 0.92 };
          flyQuiet({ ...P.base }, 600, 40);
        }
      }
    }
    pip.style.transform = `translate3d(${P.pos.x.toFixed(1)}px,${P.pos.y.toFixed(1)}px,0)`;
    pipFly.style.setProperty("--rot", P.rot.toFixed(1) + "deg");
    const sr = VW - (P.pos.x + P.S), sl = P.pos.x, need = Math.min(244, VW - 120) + 20;
    const left = P.pos.x > VW / 2 ? sl >= need || sl >= sr : !(sr >= need || sr >= sl);
    pip.style.setProperty("--bmw", Math.max(150, Math.min(244, (left ? sl : sr) - 18)) + "px");
    pip.classList.toggle("bub-l", left);
    pip.classList.toggle("bub-r", !left);
    pip.classList.toggle("bub-d", P.pos.y < 120);
    /* eyes drift toward the cursor, but he never follows it anywhere */
    if (P.pointer.x >= 0 && !pip.classList.contains("sleep") && !pip.classList.contains("fallen")) {
      const cx = P.pos.x + P.S / 2, cy = P.pos.y + P.S * 0.42, dx = P.pointer.x - cx, dy = P.pointer.y - cy;
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220) * 2.4;
      const s = `translate(${((dx / d) * k).toFixed(2)}px,${((dy / d) * k).toFixed(2)}px)`;
      pL.style.transform = s; pR.style.transform = s;
    }
    /* binoculars track the cursor's direction */
    if ((pip.dataset.prop || "").indexOf("binoc") >= 0 && P.pointer.x >= 0) {
      const bx = P.pointer.x - (P.pos.x + P.S / 2), by = P.pointer.y - (P.pos.y + P.S * 0.4);
      pip.style.setProperty("--bx", clamp(bx * 0.03, -5, 5).toFixed(1) + "px");
      pip.style.setProperty("--by", clamp(by * 0.03, -3, 3).toFixed(1) + "px");
      pip.style.setProperty("--ba", clamp(bx * 0.04, -12, 12).toFixed(1) + "deg");
    }
  }

  /* ---- little effects on the "glass" ---- */
  function fxEl(cls: string, x: number, y: number, life?: number) {
    const d = document.createElement("div");
    d.className = cls; d.style.left = x + "px"; d.style.top = y + "px";
    fx.appendChild(d);
    setTimeout(() => d.remove(), life || 1500);
    return d;
  }
  function kernels() {
    for (let i = 0; i < 5; i++) {
      const d = fxEl("kern", P.pos.x + P.S * (0.3 + Math.random() * 0.4), P.pos.y + P.S * 0.35, 1300);
      d.style.setProperty("--kx", Math.random() * 60 - 30 + "px");
      d.style.setProperty("--ky", -30 - Math.random() * 40 + "px");
    }
  }

  /* ---- 20 things Pip can do when you stop scrolling ---- */
  const topOnly = () => P.spot.kind === "top" || P.spot.kind === "floor";
  const simple = (props: string, posec: string, l1: string, l2: string, a: number, b: number) => async () => {
    if (props) prop(props);
    if (posec) pose(posec, true);
    speak(l1, a); await wait(a); await wait(300);
    if (l2) { speak(l2, b); await wait(b); }
  };
  const ACTS: Act[] = [
    { id: "walk", top: true, run: async () => {
      const a0 = getAt(P.spot), lo = P.spot.kind === "screen" ? a0 - 0.03 : 0.14, hi = P.spot.kind === "screen" ? a0 + 0.16 : 0.86;
      pose("walk", true); speak("Patrolling my territory. Nothing to report.", 2600);
      await walk(lo, 1300); await wait(250); await walk(hi, 2300);
      speak("All quiet on the sales front.", 2200); await wait(400); await walk(a0, 1300); pose("walk", false);
    } },
    { id: "fall", top: true, run: async () => {
      pose("walk", true); speak("Lovely day for a stroll...", 2200); await walk(0.88, 1700);
      pose("walk", false); pose("stumble", true); speak("Whoa whoa whoa—", 1300); await walk(1.07, 800);
      pose("stumble", false); await fall();
      prop("x stars"); speak("...ow.", 2000); await wait(2200);
      pose("fallen", false); prop(""); speak("I meant to do that.", 2400);
      await wait(700); await fly({ ...P.base }, 1200, 130);
      speak("Gravity: 1. Pip: 0.", 2600); await wait(2000);
    } },
    { id: "tap", run: async () => {
      await fly({ kind: "abs", fx: 0.5, fy: 0.46 }, 1100, 70); pose("hover", true);
      speak("*tap tap* Is this thing on?", 2400);
      fxEl("ripple", P.pos.x + P.S * 0.85, P.pos.y + P.S * 0.55, 1000); await wait(600);
      fxEl("ripple", P.pos.x + P.S * 0.85, P.pos.y + P.S * 0.55, 1000); await wait(1700);
      prop("cloth"); fxEl("fog", P.pos.x + P.S * 0.55, P.pos.y + P.S * 0.45, 2700);
      speak("Smudge detected. Wiping from the inside.", 2600); await wait(2800);
      prop(""); speak("Spotless. You're welcome.", 2200); await wait(1500); pose("hover", false);
    } },
    { id: "corn", run: async () => {
      prop("3d corn"); speak("Popcorn mode. Take your time, I'm enjoying the show.", 3200);
      await wait(900); kernels(); await wait(1500); kernels(); await wait(1300);
      speak("Plot twist: you book a demo.", 3000); kernels(); await wait(3000);
    } },
    { id: "binoc", run: async () => {
      prop("binoc"); speak("I spy with my little eye... a cursor.", 3000);
      const t0 = performance.now();
      await tween(7000, () => {
        if (P.pointer.x < 0) {
          const s = Math.sin((performance.now() - t0) / 600);
          pip.style.setProperty("--bx", (s * 4).toFixed(1) + "px");
          pip.style.setProperty("--ba", (s * 10).toFixed(1) + "deg");
        }
      });
      speak("Can't hide from me. I have optics.", 2600);
    } },
    { id: "nap", run: async () => {
      pose("sleep", true); prop("zzz"); speak("Zzz... (wiggle your mouse, I dare you)", 3600);
      const woke = new Promise<void>((res) => { P.nap = { t: performance.now(), res }; });
      await Promise.race([wait(13000), woke]);
      P.nap = null; pose("sleep", false); pose("pop", true); prop(""); pose("hop", true);
      speak("I was NOT sleeping. I was resting my eyes.", 3200); await wait(3300);
    } },
    { id: "yoga", run: simple("", "yoga", "Stretching. Twelve tabs worth of tension.", "Namaste. Or as we say in sales: next steps.", 3200, 3000) },
    { id: "juggle", run: async () => {
      prop("juggle"); speak("Juggling leads. Rule one: never drop a lead.", 3200); await wait(3600);
      pose("dropped", true); speak("...it was a sample lead. Phew.", 2600); await wait(2800);
    } },
    { id: "plane", run: async () => {
      prop("paper"); speak("Folding a paper plane. Flightpath, get it?", 2800); await wait(2900);
      prop("");
      const sx = P.pos.x + P.S * 0.9, sy = P.pos.y + P.S * 0.35;
      const pl = document.createElement("div");
      pl.className = "plane";
      pl.innerHTML = '<svg viewBox="0 0 30 20" width="30" height="20"><path d="M1 10L29 1 20 19l-5-7z" fill="#fff" stroke="#0A0A0A" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      fx.appendChild(pl);
      const dirx = P.pos.x > VW / 2 ? -1 : 1;
      const anim = pl.animate([
        { transform: `translate(${sx}px,${sy}px) rotate(${dirx > 0 ? -20 : 200}deg)` },
        { transform: `translate(${sx + dirx * VW * 0.3}px,${sy - VH * 0.22}px) rotate(${dirx > 0 ? -30 : 210}deg)`, offset: 0.5 },
        { transform: `translate(${sx + dirx * VW * 0.75}px,${sy - VH * 0.05}px) rotate(${dirx > 0 ? 15 : 165}deg)` },
      ], { duration: 2800, easing: "ease-in-out", fill: "forwards" });
      anim.onfinish = () => pl.remove();
      speak("Look at it go. Engagement-aware, naturally.", 2800); await wait(3000);
    } },
    { id: "coffee", run: simple("cup", "", "Coffee break. Decaf. I'm a bird, not a monster.", "Next step: a refill.", 3200, 2600) },
    { id: "selfie", run: async () => {
      prop("selfie"); speak("Selfie time. #sampledata", 2400); await wait(2600);
      fxEl("flash", 0, 0, 600); speak("Flash was on. Sorry about your retinas.", 2800); await wait(2800);
    } },
    { id: "read", run: simple("book", "", "Reading: “Cold Outreach for Birds”.", "Chapter 1: Don't peck. Chapter 2: also don't peck.", 2800, 3200) },
    { id: "dance", run: simple("notes", "dance", "♪ Engagement score going up, up, up ♪", "Pip's got moves. Sales-qualified moves.", 3000, 2800) },
    { id: "peek", top: true, run: async () => {
      const sp = P.spot;
      speak("Hide and seek champion, three years running.", 2000);
      const clip = (v: number) => { sp.sink = v; pipFly.style.clipPath = `inset(-80px -90px ${v.toFixed(1)}px -90px)`; };
      await tween(700, (t) => clip(ease(t) * P.S * 0.86));
      await wait(1500);
      await tween(500, (t) => clip(lerp(P.S * 0.86, P.S * 0.42, ease(t))));
      speak("Peekaboo!", 1800); pose("hop", true); await wait(1500);
      await tween(500, (t) => clip(lerp(P.S * 0.42, 0, ease(t))));
      pipFly.style.clipPath = ""; sp.sink = 0;
    } },
    { id: "mag", run: simple("mag", "", "Inspecting the sample data. Suspiciously good.", "Verdict: still sample data. Still pretty.", 3000, 3000) },
    { id: "coin", run: simple("coin", "", "Coin flip! Heads: book a demo.", "Tails: book a demo. Funny how that works.", 2600, 3200) },
    { id: "fish", top: true, run: async () => {
      const a0 = getAt(P.spot);
      await walk(Math.max(0.82, a0), 900); prop("rod");
      speak("Fishing for leads. Outbound, but with a rod.", 3200); await wait(3600);
      speak("Got one! ...sample lead. Catch and release.", 3000); await wait(3000); await walk(a0, 900);
    } },
    { id: "sweep", run: simple("broom", "", "Sweeping up twelve tabs' worth of dust.", "Cleaner already. Imagine your pipeline.", 3000, 2800) },
    { id: "phone", run: simple("phone", "", "Hello? Yes, this is a call task.", "No, I can't talk. I'm perched.", 2800, 2800) },
  ];
  function pickAct() {
    let pool = ACTS.filter((a) => (!a.top || topOnly() || a.id === "walk") && P.recent.indexOf(a.id) < 0);
    if (!pool.length) pool = ACTS;
    let a: Act | undefined;
    if (!P.recent.length && topOnly()) a = pool.find((x) => x.id === "fall"); /* first one is the classic */
    a = a || pool[Math.floor(Math.random() * pool.length)];
    P.recent.push(a.id);
    if (P.recent.length > 8) P.recent.shift();
    return a;
  }

  /* ---- idle scheduler ---- */
  const idleFromInput = () => Math.max(500, 5000 - (performance.now() - (P.lastInput || 0)));
  function scheduleIdle(ms: number) { if (P.idleT) clearTimeout(P.idleT); P.idleT = setTimeout(idleStep, ms); }
  function settle() {
    resetVisuals();
    const b = P.base, s = P.spot;
    if (spotId(s) !== spotId(b) || s.kind === "abs") return fly({ ...b }, 1000, 90);
    if (Math.abs(getAt(s) - getAt(b)) > 0.01) return walk(getAt(b), 500);
    return wait(10);
  }
  function idleStep() {
    P.idleT = 0;
    if (gone() || reduce || P.cheer || P.explaining) return;
    if (P.busy) { scheduleIdle(2500); return; } /* a section is narrating itself; no skits on top of it */
    P.resetSaid = true; /* after skits, the next scroll explains everything again */
    (async () => {
      try {
        await pickAct().run();
        await settle();
        await wait(3000);
        scheduleIdle(10);
      } catch (e) { if (e !== CANCEL) console.error(e); }
    })();
  }

  /* ---- scroll: explain what's on screen, one card at a time ---- */
  const lineText = (l: Line) => (typeof l === "string" ? l : l.t);
  const dwell = (l: Line) => clamp(1700 + lineText(l).length * 38, 3600, 6200);
  function itemSpot(it: Item): Spot | null {
    const sp: Spot = { kind: it.kind, sel: it.sel, idx: it.idx, at: it.at, fx: it.fx };
    if (sp.kind !== "screen" && !visibleSpot(sp)) return it.fallback ? { ...it.fallback } : null;
    return sp;
  }
  function explain(s: Section) {
    cancelAct();
    P.sec = s;
    if (P.resetSaid) { P.said = {}; P.resetSaid = false; }
    P.explaining = true;
    (async () => {
      let spoke = false;
      try {
        for (let i = 0; i < s.items.length; i++) {
          const it = s.items[i], key = s.id + ":" + i;
          if (P.said[key]) continue;
          const sp = itemSpot(it);
          if (!sp) continue;
          pip.classList.remove("hover");
          await fly({ ...sp }, spoke ? 800 : 1000, spoke ? 60 : 90);
          P.base = { ...sp };
          if (sp.kind === "under") pip.classList.add("hover");
          const ln = it.line;
          speak(lineText(ln), dwell(ln), typeof ln !== "string" && !!ln.act, true);
          await wait(dwell(ln) + 400);
          P.said[key] = 1;
          spoke = true;
        }
        pip.classList.remove("hover");
        P.explaining = false;
        scheduleIdle(spoke ? 5000 : idleFromInput());
      } catch (e) { P.explaining = false; if (e !== CANCEL) console.error(e); }
    })();
  }
  function sectionCheck() {
    if (gone() || P.cheer) return; /* never interrupt someone who is typing */
    const s = dominant();
    if (s) explain(s);
  }
  on(window, "scroll", () => {
    if (gone() || P.cheer) return;
    P.lastInput = performance.now();
    cancelAct();
    if (P.scrollT) clearTimeout(P.scrollT);
    P.scrollT = setTimeout(sectionCheck, 220);
  }, { passive: true });

  /* ---- keyboard: a cheerleader for forms ---- */
  const isField = (t: EventTarget | null): t is HTMLElement =>
    t instanceof HTMLElement && t.matches('input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),textarea,select,[contenteditable="true"]');
  let cheerT: ReturnType<typeof setTimeout> | 0 = 0, ci = 0;
  function armEnd() { if (cheerT) clearTimeout(cheerT); cheerT = setTimeout(endCheer, 14000); }
  function startCheer(el: HTMLElement) {
    if (gone() || reduce) return;
    const host = el.closest("[data-pip-host]"), ex = el.dataset.explain || "";
    if (P.cheer) {
      if (cheerT) clearTimeout(cheerT);
      if (ex) { speak(ex, 7500, false, true); P.lastSpeak = performance.now(); }
      armEnd();
      return;
    }
    cancelAct(); P.cheer = true; pose("cheer", true); prop("band pom");
    const spot: Spot = host ? { kind: "top", el: host, at: 0.93 } : { kind: "top", el, at: 0.9 };
    if (visibleSpot(spot)) flyQuiet(spot, 700, 50); else if (host) flyQuiet({ kind: "screen", fx: 0.94 }, 700, 50);
    speak(ex || "Typing detected! I'm on it.", ex ? 7500 : 2200, false, true);
    P.lastSpeak = performance.now();
    armEnd();
  }
  function cheerBeat() {
    const now = performance.now();
    if (now - (P.lastSpeak || 0) < 7000) { armEnd(); return; } /* never talk over a hint or a warning */
    speak(CHEER[ci++ % CHEER.length], 2200); P.lastSpeak = now; armEnd();
  }
  function endCheer() {
    if (!P.cheer) return;
    P.cheer = false; resetVisuals(); speak("Nailed it. Go go go!", 2800);
    flyQuiet({ ...P.base }, 900, 80); scheduleIdle(5200);
  }
  on(document, "focusin", (e: FocusEvent) => { if (isField(e.target) && !pip.contains(e.target)) { if (cheerT) clearTimeout(cheerT); startCheer(e.target); } });
  on(document, "input", (e: Event) => { if (!isField(e.target)) return; if (!P.cheer) startCheer(e.target); else cheerBeat(); });
  on(document, "focusout", (e: FocusEvent) => { if (P.cheer && isField(e.target)) { if (cheerT) clearTimeout(cheerT); cheerT = setTimeout(endCheer, 1500); } });

  /* ---- the cursor only gives him something to look at ---- */
  on(window, "pointermove", (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    P.pointer.x = e.clientX; P.pointer.y = e.clientY;
    if (P.nap && performance.now() - P.nap.t > 900) { const r = P.nap.res; P.nap = null; r(); }
  }, { passive: true });
  on(document.documentElement, "mouseleave", () => { P.pointer.x = -1; });
  (["keydown", "touchstart"] as const).forEach((ev) =>
    on(window, ev, () => {
      if (P.cheer || gone()) return;
      P.lastInput = performance.now();
      cancelAct();
      if (P.scrollT) clearTimeout(P.scrollT);
      P.scrollT = setTimeout(sectionCheck, 400);
    }, { passive: true }),
  );

  /* ---- sections talk to Pip through lib/pip.ts ---- */
  on(window, "pip:say", (e: CustomEvent<PipSayDetail>) => {
    if (gone() || P.cheer) return;
    speak(e.detail.text, e.detail.ms || 4500, e.detail.act, true);
    P.lastSpeak = performance.now();
  });
  on(window, "pip:busy", (e: CustomEvent<boolean>) => { P.busy = !!e.detail; });

  /* ---- poke him ---- */
  let ji = Math.floor(Math.random() * JOKES.length);
  on(pipBtn, "click", () => {
    cancelAct();
    pip.classList.remove("hop", "spin");
    void pipBtn.offsetWidth;
    pip.classList.add("hop");
    ji = (ji + 1) % JOKES.length;
    speak(JOKES[ji], 4200, false, true);
    scheduleIdle(5000);
  });

  on(window, "resize", measure);
  P.raf = requestAnimationFrame(frame);
  let bootT: ReturnType<typeof setTimeout> | 0 = setTimeout(() => { if (!gone()) sectionCheck(); }, 700);

  return {
    routeChanged() {
      cancelAct();
      P.said = {};
      P.cheer = false;
      if (bootT) clearTimeout(bootT);
      bootT = setTimeout(sectionCheck, 700);
    },
    dispose() {
      cancelAct();
      cancelAnimationFrame(P.raf);
      [P.bubbleT, P.scrollT, cheerT, bootT].forEach((t) => t && clearTimeout(t));
      disposers.forEach((d) => d());
      fx.innerHTML = "";
    },
  };
}
