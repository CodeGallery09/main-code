import { Mail, Phone, Zap, CalendarCheck, Database, MessageSquare } from "lucide-react";

export type Channel = "linkedin" | "email" | "call" | "action" | "meeting" | "crm" | "sms";

const MAP = {
  email: Mail,
  call: Phone,
  action: Zap,
  meeting: CalendarCheck,
  crm: Database,
  sms: MessageSquare,
} as const;

export function ChannelIcon({ channel, size = 14, className = "" }: { channel: Channel; size?: number; className?: string }) {
  if (channel === "linkedin") {
    // Neutral "in" glyph rather than a brand logo.
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-[3px] border border-current font-sans font-bold leading-none ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.55 }}
      >
        in
      </span>
    );
  }
  const Icon = MAP[channel];
  return <Icon size={size} className={className} aria-hidden="true" strokeWidth={1.8} />;
}
