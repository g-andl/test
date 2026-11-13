"use client";
/* eslint-disable @next/next/no-img-element */
import { Pencil } from "lucide-react";
import { MOODS, moodOf, dayPartOf } from "@/lib/mood";
import { formatTime } from "@/lib/dates";
import { usePhoto } from "@/hooks/data";
import type { MoodEntry, MoodValue } from "@/lib/types";

/** Главное действие: отметить настроение одним касанием */
export function TodayCard({ entry, onOpen }: { entry: MoodEntry | undefined; onOpen: (mood?: MoodValue) => void }) {
  const photo = usePhoto(entry?.photo_path);

  if (!entry) {
    return (
      <section className="rounded-[28px] bg-accent p-5 text-white shadow-[0_18px_40px_-18px_rgb(77_141_247/0.9)]">
        <h2 className="text-[22px] font-extrabold leading-tight tracking-tight">Как ты сегодня?</h2>
        <p className="mt-1 text-[15px] text-white/80">Выбери настроение — это займёт пару секунд</p>
        <div className="mt-5 grid grid-cols-5 gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m.value}
              onClick={() => onOpen(m.value)}
              aria-label={m.label}
              className="flex aspect-square min-h-14 flex-col items-center justify-center rounded-2xl bg-white/95 transition active:scale-95"
            >
              <span className="emoji text-[30px]">{m.emoji}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => onOpen()}
          className="mt-3 h-12 w-full rounded-2xl bg-ink text-[15px] font-semibold text-white transition active:scale-[0.98] dark:bg-[#0f1a33]"
        >
          Отметить с заметкой или фото
        </button>
      </section>
    );
  }

  const m = moodOf(entry.mood_value);
  return (
    <section className="rounded-[28px] p-5" style={{ background: m.soft }}>
      <div className="flex items-start gap-4">
        <span className="emoji flex size-16 shrink-0 items-center justify-center rounded-[20px] bg-surface text-[40px] shadow-card">
          {m.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-2">Сегодня</p>
          <h2 className="text-[24px] font-extrabold leading-tight tracking-tight" style={{ color: m.color }}>
            {m.label}
          </h2>
          <p className="text-sm text-text-2">
            {dayPartOf(entry.day_part).label}, {formatTime(entry.mood_time)}
          </p>
        </div>
        <button
          onClick={() => onOpen()}
          aria-label="Изменить запись"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text shadow-card"
        >
          <Pencil className="size-[18px]" />
        </button>
      </div>
      {entry.note && <p className="mt-4 line-clamp-3 whitespace-pre-line text-[15px] text-text">{entry.note}</p>}
      {photo.data && <img src={photo.data} alt="" loading="lazy" className="mt-4 max-h-48 w-full rounded-2xl object-cover" />}
    </section>
  );
}
