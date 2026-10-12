"use client";

import { useEffect } from "react";
import { mountLens, mountSpecular } from "./app/glass";

/**
 * Mounts the liquid-glass runtime for the marketing pages: an SVG refraction
 * lens on every pane, and the pointer tracking that drives the specular
 * highlight. The matching material lives in the glass skin at the end of
 * `app/globals.css`; add a class here and there together.
 *
 * It is rendered by `Navbar`, so every page with the site chrome gets it and
 * the dashboard (which runs its own copy over `app/app.css`) does not.
 */

/** Panes big enough for the refracted edge to read. */
const LENS_TARGETS =
  ".card,.glass,.glass-lg,.hero-frame-bg,.hcard,.jr-card,.btn,.field,.bk-day,.bk-slot,.why-chip,.uf-chip,.glass-row";

/** Everything whose highlight follows the pointer. */
const SPECULAR_TARGETS =
  ".lg-nav,.navlink,.card,.glass,.glass-lg,.hero-frame-bg,.hcard,.jr-card,.wf-box,.btn,.field,.bk-nav,.bk-day,.bk-slot,.why-chip,.uf-chip,.tag-sample,.glass-row";

export function SiteGlass() {
  useEffect(() => {
    // The navbar bends harder than the panes: it is the one surface you look
    // straight through all the way down the page.
    const disposers = [
      mountLens(".lg-nav", 1.7),
      mountLens(LENS_TARGETS, 1.15),
      mountSpecular(SPECULAR_TARGETS),
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, []);
  return null;
}
