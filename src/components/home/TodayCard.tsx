"use client";
/* eslint-disable @next/next/no-img-element */
import { Pencil } from "lucide-react";
import { MOODS, moodOf, dayPartOf } from "@/lib/mood";
import { formatTime } from "@/lib/dates";
import { usePhoto } from "@/hooks/data";
import type { MoodEntry, MoodValue } from "@/lib/types";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

/** Главное действие: отметить настроение одним касанием */
export function TodayCard({ entry, onOpen }: { entry: MoodEntry | undefined; onOpen: (mood?: MoodValue) => void }) {
  const photo = usePhoto(entry?.photo_path);

  if (!entry) {
    return (
      <section className="flex h-full flex-col rounded-[28px] bg-accent p-5 text-white shadow-[0_18px_40px_-18px_rgb(77_141_247/0.9)] lg:p-8">
        <h2 className="text-[22px] font-extrabold leading-tight tracking-tight lg:text-[30px]">Как ты сегодня?</h2>
        <p className="mt-1 text-[15px] text-white/80">Выбери настроение — это займёт пару секунд</p>
        <div className="mt-5 grid grid-cols-5 gap-1.5 lg:mt-8 lg:gap-3">
          {MOODS.map((m) => (
            <button
              key={m.value}
              onClick={() => onOpen(m.value)}
              aria-label={m.label}
              className="group flex aspect-square min-h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-white/95 transition hover:bg-white active:scale-95 lg:aspect-auto lg:h-28 lg:rounded-3xl"
            >
              <MoodEmoji value={m.value} size={40} decorative className="transition group-hover:scale-110 lg:!size-14" />
              <span className="hidden text-xs font-semibold text-[#475069] lg:block">{m.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => onOpen()}
          className="mt-3 h-12 w-full rounded-2xl bg-ink text-[15px] font-semibold text-white transition active:scale-[0.98] dark:bg-[#0f1a33] lg:h-14"
        >
          Отметить с заметкой или фото
        </button>
      </section>
    );
  }

  const m = moodOf(entry.mood_value);
  return (
    <section className="flex h-full flex-col gap-4 rounded-[28px] p-5 lg:flex-row lg:gap-6 lg:p-8" style={{ background: m.soft }}>
      <div className="min-w-0 flex-1">
      <div className="flex items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-[20px] bg-surface shadow-card">
          <MoodEmoji value={m.value} size={46} />
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
      {entry.note && <p className="mt-4 line-clamp-3 whitespace-pre-line text-[15px] text-text lg:mt-6 lg:line-clamp-6 lg:text-[17px]">{entry.note}</p>}
      </div>
      {photo.data && (
        <img src={photo.data} alt="Фото к записи" loading="lazy" className="max-h-48 w-full rounded-2xl object-cover lg:h-auto lg:max-h-60 lg:w-60 lg:self-start" />
      )}
    </section>
  );
}
