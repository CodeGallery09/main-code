"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { LOGIN_HREF } from "@/lib/site";

/**
 * Sign out, then navigate — and only after the server has confirmed, so the
 * user is never shown a signed-out page while their session is still live.
 *
 * The navigation is a full page load, not a client-side one: Next keeps a
 * visited route's stylesheet on the page, and the marketing page the user
 * lands on should start from its own styles alone.
 */
export function useSignOut() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await api.logout();
    } catch {
      setBusy(false);
      setFailed(true);
      return;
    }
    window.location.assign(LOGIN_HREF);
  }

  return { busy, failed, signOut };
}
