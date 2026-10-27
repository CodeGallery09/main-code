"use client";

import { useEffect, useState } from "react";

/**
 * The workspace clock in the top bar — the workspace's own timezone, never the
 * browser's, because a sending window is set in it. Rendered only after mount
 * so the server and the client never disagree about "now".
 */
export function WorkspaceTime({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const format = () => {
      try {
        const date = new Intl.DateTimeFormat("en-GB", {
          timeZone,
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(new Date());
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone,
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        }).formatToParts(new Date());
        const at = parts
          .filter((p) => p.type === "hour" || p.type === "minute" || p.type === "literal")
          .map((p) => p.value)
          .join("")
          .trim();
        const zone = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
        setNow(`${date.replace(",", "")} · ${at} ${zone}`.trim());
      } catch {
        // An unknown timezone string is the workspace's own data; say nothing rather than guess.
        setNow(null);
      }
    };
    format();
    const timer = window.setInterval(format, 30_000);
    return () => window.clearInterval(timer);
  }, [timeZone]);

  return <span className="font-mono text-[11.5px] text-muted-foreground">{now ?? ""}</span>;
}
