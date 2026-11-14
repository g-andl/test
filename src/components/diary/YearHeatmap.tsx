"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthGrid, toKey, todayKey, MONTHS } from "@/lib/dates";
import { moodOf, MOODS } from "@/lib/mood";
import type { EntryLite, MoodValue } from "@/lib/types";

/** Тепловая карта года: 12 мини-месяцев, без горизонтальной прокрутки */
export function YearHeatmap({
  year,
  onYear,
  byDate,
  filter,
  onDayClick,
  onMonthClick,
}: {
  year: number;
  onYear: (y: number) => void;
  byDate: Map<string, EntryLite>;
  filter?: MoodValue | null;
  onDayClick?: (key: string) => void;
  onMonthClick?: (m: number) => void;
}) {
  const today = todayKey();
  const curYear = new Date().getFullYear();
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => onYear(year - 1)} aria-label="Предыдущий год" className="flex size-11 items-center justify-center rounded-full bg-surface-2">
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-[17px] font-bold">{year}</span>
        <button
          onClick={() => onYear(year + 1)}
          disabled={year >= curYear}
          aria-label="Следующий год"
          className="flex size-11 items-center justify-center rounded-full bg-surface-2 disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 min-[420px]:grid-cols-3 lg:grid-cols-4">
        {MONTHS.map((name, mi) => (
          <div key={name}>
            <button onClick={() => onMonthClick?.(mi)} className="mb-1.5 h-7 text-sm font-semibold capitalize text-text-2 hover:text-accent">
              {name}
            </button>
            <div className="grid grid-cols-7 gap-[3px]">
              {monthGrid(year, mi).flat().map((d, i) => {
                if (!d) return <span key={i} className="aspect-square" />;
                const k = toKey(d);
                const e = byDate.get(k);
                const show = e && (!filter || e.mood_value === filter);
                return (
                  <button
                    key={i}
                    onClick={() => e && onDayClick?.(k)}
                    tabIndex={e ? 0 : -1}
                    aria-label={e ? `${d.getDate()} ${name}: ${moodOf(e.mood_value).label}` : undefined}
                    aria-hidden={!e}
                    className={`aspect-square rounded-[4px] ${k === today ? "ring-1 ring-accent" : ""}`}
                    style={{ background: show ? moodOf(e!.mood_value).color : "var(--surface-3)" }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
        {MOODS.map((m) => (
          <span key={m.value} className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ background: m.color }} /> {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
