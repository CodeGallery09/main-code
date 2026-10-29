"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, fieldErrorsOf } from "@/lib/api";
import type { LinkedInExtra } from "@/lib/audiences/summary";
import { Button } from "@/components/ws/ui/button";
import { Skeleton } from "@/components/ws/ui/misc";

/**
 * What LinkedIn says about this lead, read as a briefing for the person about to contact them.
 *
 * Everything shown is **taken from their own profile** — their headline, their roles, their
 * skills — except the "How they are likely to buy" line, which is a read of the seat they sit in
 * and is labelled as one. A profile that has not been read yet shows the button, not an empty
 * shell, so nothing here is ever mistaken for a fact the product invented.
 */
export function LeadBriefingPanel({ leadId, hasHandle }: { leadId: string; hasHandle: boolean }) {
  const [state, setState] = useState<"loading" | "ready" | "reading">("loading");
  const [stored, setStored] = useState<LinkedInExtra | null>(null);
  const [configured, setConfigured] = useState(true);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let alive = true;
    setState("loading");
    api
      .audienceLinkedIn(leadId)
      .then((answer) => {
        if (!alive) return;
        setStored(answer.linkedin.briefing ? answer.linkedin : null);
        setConfigured(answer.configured);
        setState("ready");
      })
      .catch(() => alive && setState("ready"));
    return () => {
      alive = false;
    };
  }, [leadId]);

  const read = useCallback(async () => {
    setState("reading");
    setProblem("");
    try {
      const { linkedin } = await api.readLinkedInProfile(leadId);
      setStored(linkedin);
    } catch (caught) {
      const fields = fieldErrorsOf(caught);
      setProblem(fields ? Object.values(fields)[0] : caught instanceof Error ? caught.message : "That didn't work.");
    } finally {
      setState("ready");
    }
  }, [leadId]);

  if (state === "loading") return <Skeleton className="h-[56px]" />;

  const brief = stored?.briefing ?? null;

  return (
    <div className="flex flex-col gap-[10px]">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="label-mono">From LinkedIn</h3>
        {hasHandle && configured ? (
          <Button variant="outline" size="sm" disabled={state === "reading"} onClick={() => void read()}>
            <RefreshCw aria-hidden strokeWidth={2} />
            {state === "reading" ? "Reading…" : brief ? "Read again" : "Read their profile"}
          </Button>
        ) : null}
      </span>

      {problem ? (
        <p role="alert" className="rounded-[10px] border border-warning-border bg-warning-bg px-[12px] py-[8px] text-[11.5px] text-warning">
          {problem}
        </p>
      ) : null}

      {!brief ? (
        <p className="text-[11.5px] leading-[1.55] text-muted-foreground">
          {!hasHandle
            ? "Add this lead's LinkedIn URL and their profile can be read here."
            : !configured
              ? "Reading profiles isn't configured on this deployment."
              : "Not read yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-[11px]">
          <p className="text-[12px] font-medium leading-[1.5]">{brief.headline}</p>

          {brief.signals.length ? (
            <span className="flex flex-wrap gap-[5px]">
              {brief.signals.map((signal) => (
                <span key={signal} className="rounded-full bg-muted px-[8px] py-[3px] text-[10.5px] text-body">
                  {signal}
                </span>
              ))}
            </span>
          ) : null}

          {brief.background ? <p className="text-[11.5px] leading-[1.6] text-body">{brief.background}</p> : null}

          {brief.employment.length ? (
            <div className="flex flex-col gap-[5px]">
              <span className="label-mono">Employment</span>
              <ul className="flex flex-col gap-[4px]">
                {brief.employment.map((role, i) => (
                  <li key={`${role.company}-${i}`} className="flex items-baseline justify-between gap-3 text-[11.5px]">
                    <span className="min-w-0 truncate">
                      {role.title}
                      {role.company ? <span className="text-muted-foreground"> · {role.company}</span> : null}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{role.period}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.interests.length ? (
            <div className="flex flex-col gap-[5px]">
              <span className="label-mono">Topics on their profile</span>
              <p className="text-[11.5px] leading-[1.55] text-body">{brief.interests.join(" · ")}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-[5px] rounded-lg bg-accent px-[11px] py-[9px]">
            <span className="label-mono">How to pitch · a read of their seat, not a fact about them</span>
            <p className="text-[11.5px] leading-[1.6] text-body">
              <span className="font-medium">{brief.pitch.seat}.</span> {brief.pitch.angle}
            </p>
            <p className="text-[11.5px] leading-[1.6] text-muted-foreground">Avoid: {brief.pitch.avoid}</p>
          </div>

          {brief.openers.length ? (
            <div className="flex flex-col gap-[5px]">
              <span className="label-mono">Openers from their profile</span>
              <ul className="flex list-disc flex-col gap-[4px] pl-[15px]">
                {brief.openers.map((opener) => (
                  <li key={opener} className="text-[11.5px] leading-[1.55] text-body">
                    {opener}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {stored?.fetchedAt ? (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              Read {new Date(stored.fetchedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
