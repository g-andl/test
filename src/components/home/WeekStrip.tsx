"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, startOfWeek, toKey, todayKey, WEEKDAYS_SHORT, MONTHS, capitalize } from "@/lib/dates";
import { moodOf } from "@/lib/mood";
import type { DayAgg } from "@/lib/types";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

/** Полоса недели: Пн–Вс, сегодня выделено. Нажатие открывает отметку за день. */
export function WeekStrip({ byDate, onPick }: { byDate: Map<string, DayAgg>; onPick: (key: string) => void }) {
  const [offset, setOffset] = useState(0);
  const start = addDays(startOfWeek(new Date()), offset * 7);
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="rounded-[24px] bg-surface p-3 shadow-card">
      <div className="mb-1 flex items-center justify-between px-1">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Предыдущая неделя" className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2">
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-sm font-semibold text-text-2">
          {offset === 0 ? "Эта неделя" : capitalize(`${MONTHS[start.getMonth()]} ${start.getFullYear()}`)}
        </span>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset === 0}
          aria-label="Следующая неделя"
          className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <ol className="grid grid-cols-7">
        {days.map((d, i) => {
          const k = toKey(d);
          const e = byDate.get(k);
          const isToday = k === today;
          const future = k > today;
          const m = e ? moodOf(e.value) : null;
          return (
            <li key={k}>
              <button
                onClick={() => onPick(k)}
                disabled={future}
                aria-label={`${d.getDate()} ${WEEKDAYS_SHORT[i]}${m ? `: ${m.label}` : ""}`}
                className="flex w-full flex-col items-center gap-1 rounded-2xl py-2 transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className={`text-[13px] font-medium ${isToday ? "font-bold text-accent" : "text-muted"}`}>{WEEKDAYS_SHORT[i]}</span>
                <span className={`text-[17px] font-bold ${isToday ? "text-accent" : ""}`}>{d.getDate()}</span>
                <span className="flex h-7 items-center justify-center">
                  {m ? (
                    <span className="flex size-8 items-center justify-center rounded-full" style={{ background: m.soft }}>
                      <MoodEmoji value={m.value} size={22} decorative />
                    </span>
                  ) : (
                    <span className={`size-1.5 rounded-full ${isToday ? "bg-accent" : "bg-transparent"}`} />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
