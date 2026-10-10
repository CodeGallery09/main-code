export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="var(--ink)" />
        <path d="M5 16.5c3.5 0 4.5-9 8-9 2.2 0 2.6 3 6 3" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="19" cy="10.5" r="1.9" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1" />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Flightpath</span>
    </span>
  );
}
