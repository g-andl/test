"use client";
import { Camera } from "lucide-react";
import { MOODS } from "@/lib/mood";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { EntryCard } from "@/components/diary/EntryCard";
import type { MoodEntry, MoodValue } from "@/lib/types";

/**
 * Главное действие: отметить настроение одним касанием.
 * Отметок за день может быть несколько — утром одно, вечером другое.
 */
export function TodayCard({ entries, onOpen }: { entries: MoodEntry[]; onOpen: (mood?: MoodValue) => void }) {
  const has = entries.length > 0;
  return (
    <section className="rounded-[28px] bg-surface p-5 shadow-card lg:p-7">
      <h2 className="text-[22px] font-extrabold leading-tight tracking-tight lg:text-[26px]">
        {has ? "Как ты сейчас?" : "Как ты сегодня?"}
      </h2>
      <p className="mt-1 text-[15px] text-muted">
        {has ? "Настроение меняется — отметь, если что-то изменилось" : "Выбери настроение — это займёт пару секунд"}
      </p>
      <div className="mt-5 grid grid-cols-5 gap-1.5 lg:gap-3">
        {MOODS.map((m) => (
          <button
            key={m.value}
            onClick={() => onOpen(m.value)}
            aria-label={m.label}
            className="group flex aspect-square min-h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 transition hover:bg-surface-3 active:scale-95 lg:aspect-auto lg:h-24"
          >
            <MoodEmoji value={m.value} size={40} decorative className="transition group-hover:scale-110 lg:!size-12" />
            <span className="hidden text-xs font-semibold text-text-2 lg:block">{m.label}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => onOpen()}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-semibold text-ink-fg transition active:scale-[0.98]"
      >
        <Camera className="size-[18px]" /> С заметкой или фото
      </button>

      {has && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Сегодня</p>
          <ul className="-mx-1 flex flex-col gap-1">
            {[...entries].reverse().map((e) => (
              <li key={e.id}>
                <EntryCard entry={e} own className="!p-2" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Маленький значок среднего настроения за день (для сводок) */
export function DayAvg({ value }: { value: number }) {
  return <MoodEmoji value={value} size={20} />;
}
