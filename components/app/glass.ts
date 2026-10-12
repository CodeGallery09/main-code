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

/** Attaches refraction filters to every glass surface. Returns a disposer. */
export function mountLens(): () => void {
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
    const radius = Math.round(parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0);
    const small = Math.min(w, h) < 64;
    const bevel = small ? Math.min(w, h) / 2.2 : Math.min(26, Math.min(w, h) / 3);
    const scale = small ? 5 : Math.min(16, Math.max(8, Math.min(w, h) / 14));
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
    document.querySelectorAll(LENS_TARGETS).forEach((el) => {
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

/** Writes the pointer position onto glass surfaces for the hover highlight. */
export function mountSpecular(): () => void {
  if (typeof window === "undefined") return () => {};
  let frame = 0;
  let latest: PointerEvent | null = null;

  const write = () => {
    frame = 0;
    const event = latest;
    const target = event?.target;
    if (!target || !(target instanceof Element)) return;
    let el: Element | null = target.closest(SPECULAR_TARGETS);
    // Nested surfaces all light up, so a chip inside a card lifts with it.
    for (let depth = 0; el && depth < 3; depth++) {
      const box = el.getBoundingClientRect();
      const ratio = (el as HTMLElement).offsetWidth / (box.width || 1);
      (el as HTMLElement).style.setProperty("--mx", ((event.clientX - box.left) * ratio).toFixed(0) + "px");
      (el as HTMLElement).style.setProperty("--my", ((event.clientY - box.top) * ratio).toFixed(0) + "px");
      el = el.parentElement?.closest(SPECULAR_TARGETS) ?? null;
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
  };
}
