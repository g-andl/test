"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthGrid, toKey, todayKey, WEEKDAYS_SHORT, MONTHS } from "@/lib/dates";
import { moodOf } from "@/lib/mood";
import type { EntryLite, MoodValue } from "@/lib/types";

/** Календарь месяца: неделя с понедельника, цвет и эмодзи по настроению */
export function MonthCalendar({
  year,
  month,
  onChange,
  byDate,
  filter,
  onDayClick,
  minYear,
}: {
  year: number;
  month: number;
  onChange: (y: number, m: number) => void;
  byDate: Map<string, EntryLite>;
  filter?: MoodValue | null;
  onDayClick?: (key: string) => void;
  minYear?: number;
}) {
  const weeks = monthGrid(year, month);
  const today = todayKey();
  const now = new Date();
  const years: number[] = [];
  for (let y = now.getFullYear(); y >= (minYear ?? now.getFullYear() - 5); y--) years.push(y);
  const atEnd = year === now.getFullYear() && month === now.getMonth();

  const shift = (d: number) => {
    const dt = new Date(year, month + d, 1);
    onChange(dt.getFullYear(), dt.getMonth());
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button onClick={() => shift(-1)} aria-label="Предыдущий месяц" className="flex size-11 items-center justify-center rounded-full bg-surface-2">
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor="cal-month">Месяц</label>
          <select
            id="cal-month"
            value={month}
            onChange={(e) => onChange(year, Number(e.target.value))}
            className="h-11 cursor-pointer appearance-none rounded-xl bg-transparent px-2 text-[17px] font-bold capitalize outline-none hover:bg-surface-2"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i} disabled={year === now.getFullYear() && i > now.getMonth()}>
                {m}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="cal-year">Год</label>
          <select
            id="cal-year"
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              onChange(y, y === now.getFullYear() ? Math.min(month, now.getMonth()) : month);
            }}
            className="h-11 cursor-pointer appearance-none rounded-xl bg-transparent px-2 text-[17px] font-bold text-muted outline-none hover:bg-surface-2"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => shift(1)}
          disabled={atEnd}
          aria-label="Следующий месяц"
          className="flex size-11 items-center justify-center rounded-full bg-surface-2 disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted" aria-hidden>
        {WEEKDAYS_SHORT.map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div role="grid" className="mt-1 grid gap-1">
        {weeks.map((w, wi) => (
          <div role="row" key={wi} className="grid grid-cols-7 gap-1">
            {w.map((d, di) => {
              if (!d) return <span key={di} role="gridcell" />;
              const k = toKey(d);
              const e = byDate.get(k);
              const m = e ? moodOf(e.mood_value) : null;
              const dim = filter && e && e.mood_value !== filter;
              const isToday = k === today;
              const future = k > today;
              return (
                <button
                  key={di}
                  role="gridcell"
                  disabled={future || !onDayClick}
                  onClick={() => onDayClick?.(k)}
                  aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]}${m ? `: ${m.label}` : ""}`}
                  className={`relative flex aspect-square min-h-10 flex-col items-center justify-center rounded-xl transition active:scale-95 disabled:active:scale-100 ${isToday ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""} ${future ? "opacity-35" : ""}`}
                  style={{ background: m && !dim ? m.soft : "var(--surface-2)", opacity: dim ? 0.35 : undefined }}
                >
                  <span className={`absolute left-1.5 top-1 text-[10px] font-semibold leading-none ${isToday ? "text-accent" : "text-muted"} min-[400px]:text-[11px]`}>
                    {d.getDate()}
                  </span>
                  {m && !dim ? (
                    <span className="emoji mt-1.5 text-[18px] min-[400px]:text-[22px]">{m.emoji}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
