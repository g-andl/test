"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MOODS } from "@/lib/mood";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { MoodCard, CardRow, CardSlot } from "@/components/mood/MoodCard";
import { plural } from "@/lib/dates";
import type { MoodEntry, MoodValue } from "@/lib/types";

/** Главное действие: отметить настроение одним касанием. Отметок за день может быть несколько. */
export function TodayCard({ entries, onOpen }: { entries: MoodEntry[]; onOpen: (mood?: MoodValue) => void }) {
  const has = entries.length > 0;
  return (
    <section className="rounded-[28px] bg-surface p-5 shadow-card lg:p-7">
      <h2 className="text-[22px] font-extrabold leading-tight tracking-tight lg:text-[26px]">
        {has ? "Как ты сейчас?" : "Как ты сегодня?"}
      </h2>
      <p className="mt-1 text-[15px] text-muted">
        {has ? "Настроение меняется — отметь, если что-то изменилось" : "Выбери смайлик — заметку и фото можно добавить следом"}
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
    </section>
  );
}

/** Отметки за сегодня карточками: первой — последняя, остальные листаются в сторону */
export function TodayEntries({ entries }: { entries: MoodEntry[] }) {
  if (!entries.length) return null;
  const latestFirst = [...entries].reverse();
  return (
    <section aria-label="Отметки за сегодня">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[19px] font-bold tracking-tight">
          Сегодня <span className="text-base font-medium text-muted">· {entries.length} {plural(entries.length, ["отметка", "отметки", "отметок"])}</span>
        </h2>
        <Link href={`/diary/?day=${entries[0].entry_date}`} className="flex h-10 items-center gap-0.5 text-sm font-semibold text-accent">
          Все отметки <ChevronRight className="size-4" />
        </Link>
      </div>
      <CardRow>
        {latestFirst.map((e) => (
          <CardSlot key={e.id} single={latestFirst.length === 1}>
            <MoodCard entry={e} own showDay={false} />
          </CardSlot>
        ))}
      </CardRow>
    </section>
  );
}
