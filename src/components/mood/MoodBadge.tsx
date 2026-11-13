import { moodOf } from "@/lib/mood";
import { MoodEmoji } from "./MoodEmoji";

/** Кружок с эмодзи настроения */
export function MoodBadge({ value, size = 44, className = "" }: { value: number; size?: number; className?: string }) {
  const m = moodOf(value);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size, background: m.soft, fontSize: size * 0.55 }}
      role="img"
      aria-label={m.label}
    >
      <MoodEmoji value={m.value} size={Math.round(size * 0.7)} />
    </span>
  );
}
