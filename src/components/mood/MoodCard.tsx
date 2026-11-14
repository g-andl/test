"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Lock, Maximize2 } from "lucide-react";
import { MoodEmoji } from "./MoodEmoji";
import { PhotoViewer } from "./PhotoViewer";
import { EntryActions } from "@/components/diary/EntryCard";
import { moodOf, dayPartOf } from "@/lib/mood";
import { formatRelativeDay, formatTime } from "@/lib/dates";
import { usePhoto } from "@/hooks/data";
import type { EntryLite, MoodEntry } from "@/lib/types";

/**
 * Единая карточка отметки: сверху «картинка» — фото или, если его нет, крупный эмодзи на цветном фоне,
 * поэтому карточки без фото выглядят так же цельно. Касание фото открывает его на весь экран.
 * Скрытые автором фото и заметки помечены замком.
 */
export function MoodCard({ entry, own, showDay = true, className = "" }: { entry: EntryLite | MoodEntry; own?: boolean; showDay?: boolean; className?: string }) {
  const m = moodOf(entry.mood_value);
  const photo = usePhoto(entry.photo_path);
  const [open, setOpen] = useState(false);
  const flags = entry as EntryLite;
  const hiddenPhoto = !entry.photo_path && !!flags.has_photo;
  const hiddenNote = !entry.note && !!flags.has_note;
  const when = `${showDay ? `${formatRelativeDay(entry.entry_date)} · ` : ""}${formatTime(entry.mood_time)}`;

  return (
    <article className={`flex h-full flex-col overflow-hidden rounded-[24px] bg-surface shadow-card ${className}`}>
      <div
        className="relative aspect-[16/10] w-full shrink-0"
        style={{ background: `linear-gradient(145deg, ${m.soft}, color-mix(in srgb, ${m.color} 22%, var(--surface)))` }}
      >
        {photo.data ? (
          <button onClick={() => setOpen(true)} aria-label="Открыть фото" className="group absolute inset-0">
            <img src={photo.data} alt="Фото к отметке" loading="lazy" className="size-full object-cover" />
            <span className="absolute bottom-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-black/45 text-white opacity-90 backdrop-blur transition group-hover:opacity-100">
              <Maximize2 className="size-4" />
            </span>
          </button>
        ) : hiddenPhoto ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-text-2">
            <Lock className="size-7" />
            <span className="text-sm font-semibold">Фото скрыто</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <MoodEmoji value={m.value} size={84} decorative className="drop-shadow-sm" />
          </div>
        )}
        {/* Настроение — плашка поверх картинки */}
        <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-surface/90 py-1 pl-1.5 pr-3 text-sm font-bold shadow-card backdrop-blur">
          <MoodEmoji value={m.value} size={22} decorative />
          <span style={{ color: m.color }}>{m.label}</span>
        </span>
      </div>

      <div className="flex min-h-[88px] flex-1 flex-col gap-2 p-4">
        <p className="text-[13px] font-semibold text-muted">
          {when} · {dayPartOf(entry.day_part).label.toLowerCase()}
        </p>
        {entry.note ? (
          <p className="line-clamp-4 whitespace-pre-line break-words text-[15px] leading-snug text-text-2">{entry.note}</p>
        ) : hiddenNote ? (
          <p className="flex items-center gap-1.5 text-sm text-muted"><Lock className="size-4" /> Заметка скрыта</p>
        ) : (
          <p className="text-sm text-muted/80">Без заметки</p>
        )}
        {own && "user_id" in entry && (
          <div className="mt-auto flex justify-end pt-1">
            <EntryActions entry={entry as MoodEntry} />
          </div>
        )}
      </div>
      <PhotoViewer src={open ? photo.data ?? null : null} onClose={() => setOpen(false)} />
    </article>
  );
}

/** Горизонтальная лента карточек: пальцем на телефоне, на компьютере — прокруткой */
export function CardRow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <ul className={`no-scrollbar -mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 pb-1 min-[380px]:-mx-5 min-[380px]:px-5 lg:mx-0 lg:px-0 ${className}`}>
      {children}
    </ul>
  );
}
/** Одна карточка занимает всю ширину, несколько — «выглядывают» из-за края, чтобы было понятно, что лента листается */
export function CardSlot({ children, single }: { children: React.ReactNode; single?: boolean }) {
  return (
    <li className={single ? "w-full shrink-0" : "w-[82%] shrink-0 snap-center sm:w-[56%] lg:w-[calc(50%-6px)] xl:w-[calc(33.333%-8px)]"}>
      {children}
    </li>
  );
}
