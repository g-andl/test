/* eslint-disable @next/next/no-img-element */
const PALETTE = ["#4d8df7", "#2fb67c", "#8b7cf6", "#f0a24b", "#f06b6b", "#36b5c9"];

export function Avatar({
  src,
  name,
  size = 44,
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const color = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${className}`}
      style={{ width: size, height: size, background: src ? "var(--surface-3)" : color, fontSize: size * 0.38 }}
    >
      {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover" /> : initials || "?"}
    </span>
  );
}
