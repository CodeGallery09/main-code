"use client";

import { useState } from "react";
import { Reply, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Channel, Thread } from "@/lib/data/types";
import { Button } from "@/components/ws/ui/button";

/**
 * Collapsed reply bar. The full composer only opens on Reply — an always-open
 * textarea invites typing before reading.
 *
 * The line above it says what pressing Reply will actually do on this channel, which differs:
 * a LinkedIn reply goes out through the connected account, and everything else is written onto
 * the thread because no mailbox or number can be connected yet.
 */
export function ReplyBar({
  onReply,
  channel,
  linkedInReady,
}: {
  onReply: () => void;
  channel: Channel;
  /** A healthy LinkedIn account exists, so a LinkedIn reply can genuinely be delivered. */
  linkedInReady: boolean;
}) {
  const note =
    channel === "linkedin"
      ? linkedInReady
        ? "Goes out as a LinkedIn message from your connected account · counts toward today's message limit."
        : "Saved to the thread. Connect a LinkedIn account under Setup and replies go out from here."
      : "Replies are saved to the thread. Nothing leaves Flightpath until a mailbox is connected.";
  return (
    <div className="flex flex-wrap items-center justify-between gap-[10px] border-t border-divider bg-quiet px-4 py-3">
      <span className="min-w-0 flex-1 basis-[260px] text-[11.5px] leading-[1.5] text-muted-foreground">{note}</span>
      <Button onClick={onReply}>
        <Reply aria-hidden strokeWidth={1.9} />
        Reply
      </Button>
    </div>
  );
}

/**
 * The reply composer.
 *
 * A LinkedIn reply is delivered by the repository through the workspace's connected account; on
 * every other channel the reply is written onto the thread, because no mailbox or number can be
 * connected yet. Either way the thread is the record, and a provider refusal comes back as the
 * reason rather than a silent save.
 */
export function Composer({ thread, onSaved, onClose }: { thread: Thread; onSaved: () => void; onClose: () => void }) {
  const first = thread.audienceName.split(" ")[0];
  const [body, setBody] = useState(`Hi ${first},\n\n`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const text = body.trim();
    if (!text) {
      setError("Write something first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.sendMessage(thread.id, thread.channel, text);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That reply could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[10px] border-t border-divider bg-quiet px-4 pb-4 pt-[14px]">
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono">Reply to {first}</span>
        <Button variant="outline" size="sm" onClick={onClose}>
          <X aria-hidden strokeWidth={2.2} />
          Close
        </Button>
      </div>

      <label htmlFor="reply-body" className="sr-only">
        Your reply
      </label>
      <textarea
        id="reply-body"
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full resize-y rounded-[9px] border border-input bg-card px-[14px] py-3 text-[12.5px] leading-[1.65] text-foreground"
      />

      {error ? (
        <p role="alert" className="text-[11.5px] text-warning">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-[10px] border-t border-divider pt-[11px]">
        <span className="text-[11.5px] leading-[1.5] text-muted-foreground">
          Saved to this thread and to the lead&apos;s history. Nothing is sent: no mailbox is connected yet.
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Discard
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            <Save aria-hidden strokeWidth={1.9} />
            {busy ? "Saving…" : "Save the reply"}
          </Button>
        </span>
      </div>
    </div>
  );
}
