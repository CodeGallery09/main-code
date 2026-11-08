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
 * a LinkedIn reply goes out through the connected account, an email reply goes out from the
 * mailbox the conversation is on, and anything else is written onto the thread because no number
 * can be connected yet.
 */
export function ReplyBar({
  onReply,
  channel,
  linkedInReady,
  emailReady,
}: {
  onReply: () => void;
  channel: Channel;
  /** A healthy LinkedIn account exists, so a LinkedIn reply can genuinely be delivered. */
  linkedInReady: boolean;
  /** A healthy mailbox exists, so an email reply can genuinely be delivered. */
  emailReady: boolean;
}) {
  const note = replyNote(channel, linkedInReady, emailReady);
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

/** What a reply on this channel will really do — said before it is written, and again beside Send. */
function replyNote(channel: Channel, linkedInReady: boolean, emailReady: boolean): string {
  if (channel === "linkedin") {
    return linkedInReady
      ? "Goes out as a LinkedIn message from your connected account · counts toward today's message limit."
      : "Saved to the thread. Connect a LinkedIn account under Setup and replies go out from here.";
  }
  if (channel === "email") {
    return emailReady
      ? "Goes out as an email from the mailbox this conversation is on, in the same thread."
      : "Saved to the thread. Connect a mailbox under Setup and replies go out from here.";
  }
  return "Saved to the thread. Nothing leaves Flightpath on this channel yet.";
}

/**
 * The reply composer.
 *
 * A LinkedIn or email reply is delivered by the repository through the workspace's connected
 * account; on any other channel it is written onto the thread. Either way the thread is the
 * record, and a provider refusal comes back as the reason rather than a silent save.
 */
export function Composer({
  thread,
  onSaved,
  onClose,
  linkedInReady,
  emailReady,
}: {
  thread: Thread;
  onSaved: () => void;
  onClose: () => void;
  linkedInReady: boolean;
  emailReady: boolean;
}) {
  const sends = (thread.channel === "linkedin" && linkedInReady) || (thread.channel === "email" && emailReady);
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
          {replyNote(thread.channel, linkedInReady, emailReady)}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Discard
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            <Save aria-hidden strokeWidth={1.9} />
            {busy ? (sends ? "Sending…" : "Saving…") : sends ? "Send the reply" : "Save the reply"}
          </Button>
        </span>
      </div>
    </div>
  );
}
