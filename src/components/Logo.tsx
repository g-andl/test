export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="18" fill="var(--accent)" />
        <circle cx="23" cy="27" r="4" fill="#fff" />
        <circle cx="41" cy="27" r="4" fill="#fff" />
        <path d="M20 39c3.5 5 8 7.5 12 7.5S40.5 44 44 39" stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight">Настрой</span>
    </span>
  );
}
