"use client";

/**
 * Connecting a LinkedIn account from the workspace.
 *
 * The sign-in happens on the provider's own page, in a popup: the member's LinkedIn credentials
 * and any 2FA step never touch our servers. We only ever see the account id the provider gives us
 * afterwards, and we read the account's identity back from the provider rather than from the
 * browser.
 *
 * The flow has one awkward edge worth knowing. The provider's callback lands on **our server**,
 * not in the popup, so the browser cannot tell when it has finished — hence the poll on the
 * connect session. The popup is opened synchronously on the click and then pointed at the URL once
 * it arrives, because a window opened after an `await` is blocked by every popup blocker.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ConnectSession } from "@/lib/data/types";

const POLL_MS = 2_000;
/** Long enough for a 2FA code and a slow sign-in; the session itself expires at 15 minutes. */
const GIVE_UP_MS = 5 * 60 * 1000;

export type ConnectPhase =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "waiting"; sessionId: string }
  | { kind: "done"; accountId: string | null }
  | { kind: "error"; message: string; configured: boolean };

export function useLinkedInConnect(onConnected: () => void) {
  const [phase, setPhase] = useState<ConnectPhase>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (accountId?: string) => {
      stop();
      setPhase({ kind: "opening" });
      // Opened now, while we are still inside the click, and navigated below.
      const popup = window.open("", "flightpath-linkedin", "width=520,height=720");

      let session: { url: string; sessionId: string };
      try {
        session = await api.connectLinkedIn(accountId);
      } catch (caught) {
        popup?.close();
        const code = caught instanceof ApiError ? caught.code : "";
        setPhase({
          kind: "error",
          message: caught instanceof Error ? caught.message : "Could not start the sign-in.",
          // `not_configured` is the deployment's problem, not the user's: say so differently.
          configured: code !== "not_configured" && code !== "unavailable",
        });
        return;
      }

      if (popup) popup.location.href = session.url;
      // A blocked popup is not a dead end: the same URL works in this tab.
      else window.location.href = session.url;

      setPhase({ kind: "waiting", sessionId: session.sessionId });

      const until = Date.now() + GIVE_UP_MS;
      const poll = async () => {
        let current: ConnectSession;
        try {
          current = (await api.connectSession(session.sessionId)).session;
        } catch {
          // A failed poll is usually a lost network, not a failed connection: keep trying.
          if (Date.now() < until) timer.current = setTimeout(() => void poll(), POLL_MS);
          return;
        }
        if (current.state === "connected") {
          popup?.close();
          setPhase({ kind: "done", accountId: current.accountId });
          onConnected();
          return;
        }
        if (current.state === "failed" || current.state === "expired") {
          setPhase({
            kind: "error",
            message:
              current.detail ||
              (current.state === "expired"
                ? "That sign-in link expired before it was used."
                : "The sign-in didn't complete."),
            configured: true,
          });
          return;
        }
        if (Date.now() < until) {
          timer.current = setTimeout(() => void poll(), POLL_MS);
        } else {
          setPhase({
            kind: "error",
            message: "Still waiting on the provider. If you finished signing in, reload this page.",
            configured: true,
          });
        }
      };
      timer.current = setTimeout(() => void poll(), POLL_MS);
    },
    [onConnected, stop],
  );

  const reset = useCallback(() => {
    stop();
    setPhase({ kind: "idle" });
  }, [stop]);

  return { phase, start, reset, busy: phase.kind === "opening" || phase.kind === "waiting" };
}

/** The one line under the button that says what is happening. Never claims more than it knows. */
export function ConnectStatus({ phase }: { phase: ConnectPhase }) {
  if (phase.kind === "idle") return null;
  if (phase.kind === "opening") return <small className="muted">Opening LinkedIn sign-in…</small>;
  if (phase.kind === "waiting") {
    return <small className="muted">Waiting for you to finish signing in, in the other window…</small>;
  }
  if (phase.kind === "done") return <small className="muted">Connected. Your account is syncing.</small>;
  return (
    <small className="muted" role="status">
      {phase.message}
    </small>
  );
}
