/** Line icons for the workspace, drawn on a 24px grid to match the app's stroke weight. */

type Props = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const HomeIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4v-5.5H9V20H5a1 1 0 0 1-1-1z" />
  </svg>
);

export const InboxIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3.5 13.5 6 5.5h12l2.5 8V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" />
    <path d="M3.5 13.5H8a1 1 0 0 1 1 1 1.5 1.5 0 0 0 1.5 1.5h3A1.5 1.5 0 0 0 15 14.5a1 1 0 0 1 1-1h4.5" />
  </svg>
);

export const LeadsIcon = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c0-3.1 2.5-5.3 5.5-5.3s5.5 2.2 5.5 5.3" />
    <path d="M16 6.2a2.9 2.9 0 0 1 0 5.6M17.4 14.6c2 .6 3.3 2.4 3.3 4.9" />
  </svg>
);

export const CampaignIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M20.5 3.5 10.8 13.2" />
    <path d="M20.5 3.5 14.3 20.5l-3.5-7.3-7.3-3.5z" />
  </svg>
);

export const AnalyticsIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M5 20V11M12 20V4.5M19 20v-6" />
  </svg>
);

export const SettingsIcon = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" />
  </svg>
);

export const SearchIcon = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.6-3.6" />
  </svg>
);

export const BellIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
    <path d="M13.7 19a2 2 0 0 1-3.4 0" />
  </svg>
);

export const PlusIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

export const ChevronRight = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
);

export const ChevronDown = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m5.5 9 6.5 6.5L18.5 9" />
  </svg>
);

export const SidebarIcon = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M10 4.5v15" />
  </svg>
);

export const LogoutIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" />
    <path d="M17 8.5 20.5 12 17 15.5M20.5 12H10" />
  </svg>
);

export const CheckIcon = (p: Props) => (
  <svg {...base} {...p} strokeWidth={2.4}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const SendIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4.5 12 20 4.5 15 20l-3.4-6.6z" />
  </svg>
);

export const StarIcon = ({ filled, ...p }: Props & { filled?: boolean }) => (
  <svg {...base} {...p} fill={filled ? "currentColor" : "none"}>
    <path d="m12 4.5 2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.7 5.4-.7z" />
  </svg>
);

/* ---- channel marks ------------------------------------------------------- */

export const LinkedInIcon = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M8 10.5V16M8 7.8v.01M11.8 16v-5.5M11.8 13.2a2.6 2.6 0 0 1 5.2 0V16" />
  </svg>
);

export const MailIcon = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m3.6 7.5 8.4 5.6 8.4-5.6" />
  </svg>
);

export const WhatsAppIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z" />
    <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5" />
  </svg>
);

export const PhoneIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M5 4h3.6l1.8 4.5-2.3 1.4a11.5 11.5 0 0 0 5 5l1.4-2.3L19 14.4V18a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
);

export const SmsIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M20.5 11.5c0 3.9-3.8 7-8.5 7-.9 0-1.8-.1-2.6-.3L4 20.5l1.2-3.6A6.9 6.9 0 0 1 3.5 11.5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z" />
  </svg>
);
