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

export function AnalyticsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
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
