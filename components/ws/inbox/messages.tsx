import type { Message, Thread } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { ChannelChip, Initials } from "@/components/ws/ui/misc";

const TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const at = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
};

/** Channel and time of the most recent message — shown on list rows and in the rail. */
export function lastTouch(thread: Thread, messages: Message[]) {
  const last = messages[messages.length - 1];
  if (!last) return `${CHANNEL_NAME[thread.channel]} · ${at(thread.lastAt)}`;
  return `${CHANNEL_NAME[last.channel]} · ${at(last.sentAt)}`;
}

/**
 * One record in the history. The tag carries the channel only — who sent it is
 * clear from the name on the record, so there is no "Sent · Step 1".
 */
export function MessageRecord({ m, thread }: { m: Message; thread: Thread }) {
  const out = m.from === "us";
  return (
    <article className="flex flex-col gap-[7px] rounded-[10px] border border-divider bg-chrome px-[14px] py-[8px]">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Initials text={out ? "YOU" : thread.initials} size={24} className="text-[9.5px]" />
          <ChannelChip>{CHANNEL_NAME[m.channel]}</ChannelChip>
          <span className="text-[11.5px] font-medium">{out ? "You" : thread.audienceName}</span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{at(m.sentAt)}</span>
      </span>
      <p className="whitespace-pre-line text-[12.5px] leading-[1.6] text-prose">{m.body}</p>
    </article>
  );
}
