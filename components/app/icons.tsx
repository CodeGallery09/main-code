/**
 * Icon set for the signed-in app, drawn to match the product design reference:
 * one 24px grid, 1.9 stroke, round caps and joins.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Icon({ className = "", children, ...rest }: IconProps) {
  return (
    <svg
      className={"i " + className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" />
    </Icon>
  );
}

export function InboxIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 13l3-8h12l3 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
      <path d="M3 13h5l1 3h6l1-3h5" />
    </Icon>
  );
}

export function LeadsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
      <path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.5a3.5 3.5 0 010 7M18.5 14.3c1.9.8 3 2.8 3 5.7" />
    </Icon>
  );
}

export function CampaignsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </Icon>
  );
}

/** A branching sequence — the shape of a workflow on the canvas. */
export function WorkflowsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="2.5" y="3" width="7" height="5.5" rx="1.8" />
      <rect x="14.5" y="3" width="7" height="5.5" rx="1.8" />
      <rect x="14.5" y="15.5" width="7" height="5.5" rx="1.8" />
      <path d="M9.5 5.75h5M6 8.5v6.75a3 3 0 003 3h5.5" />
    </Icon>
  );
}

/** Two plugged connectors, for the integrations section. */
export function IntegrationsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.5 13.5l-2 2a3.2 3.2 0 01-4.5-4.5l2-2" />
      <path d="M13.5 10.5l2-2a3.2 3.2 0 014.5 4.5l-2 2" />
      <path d="M9.5 14.5l5-5" />
    </Icon>
  );
}

export function AnalyticsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </Icon>
  );
}

/** Sliders: the setup a workspace does once, before campaigns run. */
export function ConfigurationIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <path d="M16 7a2 2 0 10-4 0 2 2 0 004 0zM10 17a2 2 0 10-4 0 2 2 0 004 0z" />
    </Icon>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </Icon>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M11 18a7 7 0 100-14 7 7 0 000 14z" />
      <path d="M20 20l-4-4" />
    </Icon>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 003.4 0" />
    </Icon>
  );
}

export function SignOutIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4" />
      <path d="M16 8l4 4-4 4M20 12H9" />
    </Icon>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 12l5 5 9-10" />
    </Icon>
  );
}

export function BackIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  );
}

export function PanelIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
      <path d="M9 4v16" />
    </Icon>
  );
}

/** The Flightpath mark: a paper-plane wing, drawn heavier than the UI icons. */
export function Mark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 18c4-1 6-6 9-9 2-2 4-3 7-4-1 3-2 5-4 7-3 3-8 5-12 6z" />
    </svg>
  );
}

/**
 * Extra glyphs the campaign builder needs, kept as a path table rather than
 * twenty more exports. Same 24px grid as the icons above.
 */
const GLYPHS: Record<string, string | string[]> = {
  users: [
    "M9 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
    "M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6",
    "M16 4.5a3.5 3.5 0 010 7M18.5 14.3c1.9.8 3 2.8 3 5.7",
  ],
  li: [
    "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z",
    "M8 11v5M8 8v.01M12 16v-5M12 13a3 3 0 016 0v3",
  ],
  mail: ["M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z", "M3 7l9 6 9-6"],
  wa: [
    "M3.5 20.5l1.3-4.2A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.2-1.1z",
    "M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8a4 4 0 01-2.2-2.2l.8-1-1-2z",
  ],
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  sms: [
    "M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1h-9l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z",
    "M8 11h.01M12 11h.01M16 11h.01",
  ],
  wait: ["M6 3h12M6 21h12", "M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"],
  branch: ["M6 3v12", "M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6z", "M18 9a9 9 0 01-9 9"],
  split: ["M12 3v6", "M12 9l-6 6v5M12 9l6 6v5"],
  flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  exit: ["M15 4h4v16h-4", "M10 8l-4 4 4 4M6 12h10"],
  lock: ["M6 10h12v10H6z", "M9 10V7a3 3 0 016 0v3"],
  plus: "M12 5v14M5 12h14",
  chev: "M6 9l6 6 6-6",
  minus: "M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  undo: ["M9 14L4 9l5-5", "M4 9h11a5 5 0 010 10h-3"],
  redo: ["M15 14l5-5-5-5", "M20 9H9a5 5 0 000 10h3"],
  tidy: ["M4 4h6v6H4zM14 14h6v6h-6z", "M7 10v4a2 2 0 002 2h5"],
  fit: ["M4 9V5a1 1 0 011-1h4M20 15v4a1 1 0 01-1 1h-4", "M15 4h4a1 1 0 011 1v4M9 20H5a1 1 0 01-1-1v-4"],
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  alert: ["M12 3l10 18H2z", "M12 10v5M12 18h.01"],
};

export function Glyph({ n, ...rest }: IconProps & { n: string }) {
  const d = GLYPHS[n] || "";
  return (
    <Icon {...rest}>
      {(Array.isArray(d) ? d : [d]).map((path, i) => (
        <path d={path} key={i} />
      ))}
    </Icon>
  );
}
