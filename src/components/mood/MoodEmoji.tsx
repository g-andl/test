/* eslint-disable @next/next/no-img-element */
import { moodOf } from "@/lib/mood";
import { asset } from "@/lib/paths";

/** Путь к картинке эмодзи настроения (Microsoft Fluent Emoji 3D, MIT) */
export const moodEmojiSrc = (value: number) => asset(`/emoji/mood-${moodOf(value).value}.webp`);

/** Объёмный эмодзи настроения — одинаковый на всех устройствах */
export function MoodEmoji({ value, size = 28, className = "", decorative }: { value: number; size?: number; className?: string; decorative?: boolean }) {
  const m = moodOf(value);
  return (
    <img
      src={moodEmojiSrc(m.value)}
      width={size}
      height={size}
      alt={decorative ? "" : m.label}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={`inline-block shrink-0 select-none object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
