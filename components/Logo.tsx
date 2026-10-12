/** `compact` drops the wordmark, for the collapsed app rail and small screens. */
export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs><linearGradient id="fp-logo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a3a3f" /><stop offset="1" stopColor="#0a0a0a" /></linearGradient></defs>
        <rect x="0" y="0" width="24" height="24" rx="7.2" fill="url(#fp-logo)" />
        <path d="M5 16.5c3.5 0 4.5-9 8-9 2.2 0 2.6 3 6 3" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="19" cy="10.5" r="1.9" fill="#fff" />
      </svg>
      {!compact && <span className="text-[18px] font-bold tracking-[-0.03em] text-ink">Flightpath</span>}
    </span>
  );
}
