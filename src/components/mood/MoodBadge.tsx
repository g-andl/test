import { moodOf } from "@/lib/mood";

/** Кружок с эмодзи настроения */
export function MoodBadge({ value, size = 44, className = "" }: { value: number; size?: number; className?: string }) {
  const m = moodOf(value);
  return (
    <span
      className={`emoji inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size, background: m.soft, fontSize: size * 0.55 }}
      role="img"
      aria-label={m.label}
    >
      {m.emoji}
    </span>
  );
}
