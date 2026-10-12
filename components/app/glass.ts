/**
 * Liquid glass runtime.
 *
 * Two effects, both ported from the product design reference so the material
 * behaves identically:
 *
 *  - `mountLens` gives every glass surface real refraction. For each element it
 *    paints a normal map of a rounded-rect bevel into a canvas, hands that to an
 *    SVG `feDisplacementMap`, and points the element's `--lens` at the filter.
 *    Filters are keyed by width/height/radius so they are shared and recycled.
 *  - `mountSpecular` tracks the pointer and writes `--mx` / `--my` on the
 *    surface under it (and up to two ancestors), which the stylesheet uses to
 *    slide a highlight across the glass on hover.
 *
 * Both are no-ops without a DOM, and `mountLens` bails out where
 * `backdrop-filter` is unsupported — the flat surfaces still look correct.
 */

/** Surfaces that get a refraction lens. */
const LENS_TARGETS =
  ".card,.pane,.side,.modal,.drawer,.cmdk,.pop,.rowpop,.qmenu,.inspector,.palette,.search,.sendsw,.seg,.chtog,.btn.line,.tabbar,.fpnode,.q,.stepper";

/** Surfaces whose highlight follows the pointer. */
const SPECULAR_TARGETS =
  ".card,.btn,.ib,.navi,.search,.sendsw,.seg,.th,.pi,.fpnode,.opt,.tpl,.chtog,.outs button,.q,.tabbar button,.side,.modal,.drawer,.cmdk,.pop,.rowpop,.qmenu,.inspector,.palette,.stepper";

const SVG_NS = "http://www.w3.org/2000/svg";

/** How long a ripple takes to run out across a surface. */
const RIPPLE_MS = 950;

/** Max distinct filters kept alive; past this we stop minting new ones. */
const MAX_FILTERS = 160;

/**
 * Paints the bevel normal map for a w×h rounded rect as a data URL.
 *
 * R and G carry the x/y displacement of the refracted ray, so the bevel bends
 * what is behind the glass inwards at the edges and leaves the centre flat.
 */
function bevelMap(w: number, h: number, radius: number, bevel: number, scale: number): string {
  // Half-res for big surfaces; the map is sampled smoothly either way.
  const res = w * h > 160000 ? 0.35 : 0.5;
  const mw = Math.max(2, Math.round(w * res));
  const mh = Math.max(2, Math.round(h * res));
  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(mw, mh);
  const px = img.data;
  const r = Math.min(radius, w / 2, h / 2);

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const cx = (x + 0.5) / res;
      const cy = (y + 0.5) / res;
      const sx = Math.sign(cx - w / 2) || 1;
      const sy = Math.sign(cy - h / 2) || 1;
      // Distance past the straight edges of the inner rect, per axis.
      const dx = Math.abs(cx - w / 2) - (w / 2 - r);
      const dy = Math.abs(cy - h / 2) - (h / 2 - r);

      let edge: number; // distance inwards from the outer edge
      let nx: number;
      let ny: number;
      if (dx > 0 && dy > 0) {
        // In a corner: normal points along the radius.
        const d = Math.hypot(dx, dy) || 1;
        edge = r - d;
        nx = -(dx / d) * sx;
        ny = -(dy / d) * sy;
      } else if (dx > dy) {
        edge = r - dx;
        nx = -sx;
        ny = 0;
      } else {
        edge = r - dy;
        nx = 0;
        ny = -sy;
      }

      // Ramp the bend up over the bevel width, eased so the centre stays clean.
      const t = edge < bevel ? 1 - Math.max(0, edge) / bevel : 0;
      const amount = t * t * scale;
      const i = (y * mw + x) * 4;
      px[i] = 128 + ((nx * amount) / scale) * 127;
      px[i + 1] = 128 + ((ny * amount) / scale) * 127;
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Attaches refraction filters to every glass surface. Returns a disposer.
 * `targets` narrows which elements get a lens — the marketing navbar passes its
 * own selector so it does not pull in the workspace classes — and `strength`
 * scales how hard the edge bends.
 */
export function mountLens(targets: string = LENS_TARGETS, strength = 1): () => void {
  if (typeof document === "undefined") return () => {};
  const supported =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"));
  if (!supported) return () => {};

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.pointerEvents = "none";
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);

  const made = new Map<string, true>();
  const seen = new WeakSet<Element>();

  const apply = (el: Element) => {
    const node = el as HTMLElement;
    // Round to even pixels so near-identical sizes share one filter.
    const w = Math.round(node.offsetWidth / 2) * 2;
    const h = Math.round(node.offsetHeight / 2) * 2;
    if (w < 8 || h < 8) return;
    // Pill shapes report a radius larger than the box; clamp so the bevel and
    // the clip path stay sane.
    const raw = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0;
    const radius = Math.round(Math.min(raw, Math.min(w, h) / 2));
    const small = Math.min(w, h) < 64;
    const bevel = small ? Math.min(w, h) / 2.2 : Math.min(26, Math.min(w, h) / 3);
    const scale = (small ? 5 : Math.min(16, Math.max(8, Math.min(w, h) / 14))) * strength;
    const id = `lg-${w}-${h}-${radius}`;

    if (!made.has(id)) {
      if (made.size > MAX_FILTERS) return;
      const filter = document.createElementNS(SVG_NS, "filter");
      filter.setAttribute("id", id);
      filter.setAttribute("filterUnits", "userSpaceOnUse");
      filter.setAttribute("x", "0");
      filter.setAttribute("y", "0");
      filter.setAttribute("width", String(w));
      filter.setAttribute("height", String(h));
      filter.setAttribute("color-interpolation-filters", "sRGB");

      const map = document.createElementNS(SVG_NS, "feImage");
      map.setAttribute("href", bevelMap(w, h, radius, bevel, scale));
      map.setAttribute("x", "0");
      map.setAttribute("y", "0");
      map.setAttribute("width", String(w));
      map.setAttribute("height", String(h));
      map.setAttribute("preserveAspectRatio", "none");
      map.setAttribute("result", "map");

      const displace = document.createElementNS(SVG_NS, "feDisplacementMap");
      displace.setAttribute("in", "SourceGraphic");
      displace.setAttribute("in2", "map");
      displace.setAttribute("scale", String(scale * 2));
      displace.setAttribute("xChannelSelector", "R");
      displace.setAttribute("yChannelSelector", "G");

      filter.appendChild(map);
      filter.appendChild(displace);
      defs.appendChild(filter);
      made.set(id, true);
    }

    node.style.setProperty("--lens", `url(#${id})`);
    node.style.setProperty("--rad", radius + "px");
  };

  const resize = new ResizeObserver((entries) => entries.forEach((e) => apply(e.target)));
  let frame = 0;
  const scan = () => {
    frame = 0;
    document.querySelectorAll(targets).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      resize.observe(el);
      apply(el);
    });
  };
  scan();

  const mutations = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(scan);
  });
  mutations.observe(document.body, { childList: true, subtree: true });

  return () => {
    mutations.disconnect();
    resize.disconnect();
    cancelAnimationFrame(frame);
    svg.remove();
  };
}

/**
 * Writes the pointer position onto glass surfaces for the hover highlight, and
 * sends a ripple out from wherever the pointer lands on one.
 */
export function mountSpecular(targets: string = SPECULAR_TARGETS): () => void {
  if (typeof window === "undefined") return () => {};
  let frame = 0;
  let latest: PointerEvent | null = null;
  let entered: Element | null = null;
  // The ripple is driven here, frame by frame, rather than by a CSS animation
  // or transition: the hero tiles override both with their own.
  let ripple: HTMLElement | null = null;
  let rippleStart = 0;
  let rippleFrame = 0;

  const stepRipple = (now: number) => {
    rippleFrame = 0;
    if (!ripple) return;
    const t = Math.min(1, (now - rippleStart) / RIPPLE_MS);
    ripple.style.setProperty("--rip", (1 - (1 - t) ** 3).toFixed(3));
    if (t < 1) rippleFrame = requestAnimationFrame(stepRipple);
    else ripple = null;
  };

  const write = () => {
    frame = 0;
    const event = latest;
    const target = event?.target;
    if (!target || !(target instanceof Element)) return;
    let el: Element | null = target.closest(targets);
    if (el !== entered) {
      entered = el;
      // Send a ring out from wherever the pointer landed.
      if (ripple) ripple.style.setProperty("--rip", "1");
      ripple = el as HTMLElement | null;
      if (ripple) {
        ripple.style.setProperty("--rip", "0");
        rippleStart = performance.now();
        if (!rippleFrame) rippleFrame = requestAnimationFrame(stepRipple);
      }
    }
    // Nested surfaces all light up, so a chip inside a card lifts with it.
    for (let depth = 0; el && depth < 3; depth++) {
      const box = el.getBoundingClientRect();
      const ratio = (el as HTMLElement).offsetWidth / (box.width || 1);
      (el as HTMLElement).style.setProperty("--mx", ((event.clientX - box.left) * ratio).toFixed(0) + "px");
      (el as HTMLElement).style.setProperty("--my", ((event.clientY - box.top) * ratio).toFixed(0) + "px");
      el = el.parentElement?.closest(targets) ?? null;
    }
  };

  const onMove = (event: PointerEvent) => {
    latest = event;
    if (!frame) frame = requestAnimationFrame(write);
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    window.removeEventListener("pointermove", onMove);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(rippleFrame);
  };
}

/* ---------------------------------------------------------------------------
   The droplet: a bead of water that follows the cursor across the glass.

   It is one fixed element at the end of <body>, not a pseudo-element of each
   surface, because an element with `backdrop-filter` becomes a backdrop root:
   a child of a glass pane can only sample the pane, never the page behind it.
   From the body it sits above the glass and refracts both at once.

   A clip wrapper is sized to whichever surface the pointer is on, so the bead
   is cut off at the card's rounded edge instead of hanging over it.
--------------------------------------------------------------------------- */

/** Diameter of the bead, in CSS pixels. */
const DROP_SIZE = 106;
/** Hardest the bead bends what is under it, at its rim. */
const DROP_BEND = 14;

/** Normal map of a water bead: flat in the middle, bending hard at the rim. */
function sphereMap(size: number): string {
  const res = 0.5;
  const n = Math.max(2, Math.round(size * res));
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(n, n);
  const px = img.data;
  const r = size / 2;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / res - r;
      const dy = (y + 0.5) / res - r;
      const d = Math.hypot(dx, dy) || 1;
      const t = Math.min(1, d / r);
      // Ease the bend in, so the centre magnifies gently and the rim snaps.
      const amount = t ** 3;
      const i = (y * n + x) * 4;
      px[i] = 128 - (dx / d) * amount * 127;
      px[i + 1] = 128 - (dy / d) * amount * 127;
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export function mountDroplet(targets: string): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const supported =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"));
  if (!supported) return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.pointerEvents = "none";
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);

  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", "lg-drop");
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", String(DROP_SIZE));
  filter.setAttribute("height", String(DROP_SIZE));
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const map = document.createElementNS(SVG_NS, "feImage");
  map.setAttribute("href", sphereMap(DROP_SIZE));
  map.setAttribute("x", "0");
  map.setAttribute("y", "0");
  map.setAttribute("width", String(DROP_SIZE));
  map.setAttribute("height", String(DROP_SIZE));
  map.setAttribute("preserveAspectRatio", "none");
  map.setAttribute("result", "map");
  const displace = document.createElementNS(SVG_NS, "feDisplacementMap");
  displace.setAttribute("in", "SourceGraphic");
  displace.setAttribute("in2", "map");
  displace.setAttribute("scale", String(DROP_BEND * 2));
  displace.setAttribute("xChannelSelector", "R");
  displace.setAttribute("yChannelSelector", "G");
  filter.appendChild(map);
  filter.appendChild(displace);
  defs.appendChild(filter);
  document.body.appendChild(svg);

  const clip = document.createElement("div");
  clip.className = "lq-clip";
  clip.setAttribute("aria-hidden", "true");
  const drop = document.createElement("div");
  drop.className = "lq-drop";
  drop.style.setProperty("--dw", DROP_SIZE + "px");
  drop.style.setProperty("--drop", "url(#lg-drop)");
  clip.appendChild(drop);
  document.body.appendChild(clip);

  let current: Element | null = null;
  let frame = 0;
  let latest: PointerEvent | null = null;

  const hide = () => {
    clip.classList.remove("is-on");
    current = null;
  };

  const place = () => {
    frame = 0;
    const event = latest;
    const target = event?.target;
    if (!target || !(target instanceof Element)) return hide();
    const el = target.closest(targets);
    if (!el) return hide();

    const box = el.getBoundingClientRect();
    if (box.width < DROP_SIZE * 0.55 || box.height < 40) return hide();

    if (el !== current) {
      current = el;
      const raw = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const radius = Math.min(raw, box.width / 2, box.height / 2);
      // A tilted card reports a bounding box bigger than itself, so pull the
      // clip in by the slack; otherwise the bead hangs over the corners.
      const sx = Math.max(0, (box.width - (el as HTMLElement).offsetWidth) / 2);
      const sy = Math.max(0, (box.height - (el as HTMLElement).offsetHeight) / 2);
      clip.style.clipPath = `inset(${sy.toFixed(1)}px ${sx.toFixed(1)}px round ${radius}px)`;
    }
    clip.style.left = box.left + "px";
    clip.style.top = box.top + "px";
    clip.style.width = box.width + "px";
    clip.style.height = box.height + "px";
    drop.style.left = event.clientX - box.left + "px";
    drop.style.top = event.clientY - box.top + "px";
    clip.classList.add("is-on");
  };

  const onMove = (event: PointerEvent) => {
    // A bead of water is a cursor effect; touch has no cursor to follow.
    if (event.pointerType === "touch") return hide();
    latest = event;
    if (!frame) frame = requestAnimationFrame(place);
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  // The clip is placed in viewport coordinates, so anything that moves the
  // page under it would leave it behind; drop it and wait for the next move.
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("blur", hide);

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("scroll", hide);
    window.removeEventListener("blur", hide);
    cancelAnimationFrame(frame);
    clip.remove();
    svg.remove();
  };
}
