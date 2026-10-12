"use client";

import { useEffect } from "react";
import { mountLens, mountSpecular } from "./glass";

/**
 * Mounts the liquid-glass runtime for a subtree. Render once per page that uses
 * the glass material; it renders nothing itself.
 */
export default function Glass() {
  useEffect(() => {
    const disposeLens = mountLens();
    const disposeSpecular = mountSpecular();
    return () => {
      disposeLens();
      disposeSpecular();
    };
  }, []);
  return null;
}
