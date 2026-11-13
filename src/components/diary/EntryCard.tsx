"use client";
/* eslint-disable @next/next/no-img-element */
import { moodOf, dayPartOf } from "@/lib/mood";
import { formatTime } from "@/lib/dates";
import { usePhoto } from "@/hooks/data";
import type { EntryLite } from "@/lib/types";

/** Карточка записи в стиле таймлайна */
export function EntryCard({ entry, onClick, highlight }: { entry: EntryLite; onClick?: () => void; highlight?: boolean }) {
  const m = moodOf(entry.mood_value);
  const photo = usePhoto(entry.photo_path);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className="block w-full rounded-[20px] p-4 text-left transition active:scale-[0.99]"
      style={{ background: highlight ? m.soft : "var(--surface)" }}
    >
      <div className="flex items-center gap-3">
        <span className="emoji flex size-11 shrink-0 items-center justify-center rounded-2xl text-[26px]" style={{ background: m.soft }}>
          {m.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold" style={{ color: m.color }}>{m.label}</p>
          <p className="text-[13px] text-muted">{dayPartOf(entry.day_part).label}</p>
        </div>
        <span className="text-[15px] font-semibold text-muted">{formatTime(entry.mood_time)}</span>
      </div>
      {entry.note && <p className="mt-3 line-clamp-4 whitespace-pre-line text-[15px] leading-relaxed text-text-2">{entry.note}</p>}
      {photo.data && <img src={photo.data} alt="Фото к записи" loading="lazy" className="mt-3 max-h-60 w-full rounded-2xl object-cover" />}
    </Tag>
  );
}
