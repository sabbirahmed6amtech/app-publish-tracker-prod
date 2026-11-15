export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} role="img" aria-label="Publish Tracker">
      <defs>
        <linearGradient id="brand-mark-gradient" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#brand-mark-gradient)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="2.4" />
      <path d="M16 7a9 9 0 1 1-9 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M16 20.5v-9M12.6 14.6 16 11.2l3.4 3.4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
