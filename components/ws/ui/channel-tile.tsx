import type { Channel } from "@/lib/data/types";
import { CHANNEL_COLOR, CHANNEL_MONO } from "@/lib/ws/channels";
import { cn } from "@/lib/ws/utils";

const SIZES = {
  xs: "size-[22px] rounded-[6px] text-[9px]",
  sm: "size-[26px] rounded-[7px] text-[9.5px]",
  md: "size-[32px] rounded-lg text-[10px]",
  lg: "size-[38px] rounded-[10px] text-[11px]",
};

/**
 * Coloured square identifying a channel or an integration.
 *
 * Production: swap the monogram for each vendor's official partner SVG at the
 * same tile size and radius.
 */
export function ChannelTile({
  channel,
  color,
  mono,
  size = "md",
  muted,
  className,
}: {
  channel?: Channel;
  /** Override for integrations that aren't a channel (HubSpot, Calendly…). */
  color?: string;
  mono?: string;
  size?: keyof typeof SIZES;
  /** Grey version for disconnected / not-set-up states. */
  muted?: boolean;
  className?: string;
}) {
  const background = color ?? (channel ? CHANNEL_COLOR[channel] : undefined);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-mono font-bold",
        SIZES[size],
        muted ? "bg-muted text-muted-foreground" : "text-white",
        className,
      )}
      style={muted ? undefined : { background }}
    >
      {mono ?? (channel ? CHANNEL_MONO[channel] : null)}
    </span>
  );
}
