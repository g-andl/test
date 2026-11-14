"use client";
import { EntryCard } from "./EntryCard";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { formatRelativeDay, fromKey, WEEKDAYS, weekdayIndex, MONTHS } from "@/lib/dates";
import { moodOf } from "@/lib/mood";
import { groupByDate } from "@/hooks/data";
import type { EntryLite, MoodEntry } from "@/lib/types";

/** Лента: месяцы → дни → отметки дня по времени (линия с точками) */
export function Timeline({ entries, own }: { entries: (EntryLite | MoodEntry)[]; own?: boolean }) {
  const days = [...groupByDate(entries).entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const months: { title: string; days: typeof days }[] = [];
  for (const d of days) {
    const date = fromKey(d[0]);
    const title = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    if (months.at(-1)?.title !== title) months.push({ title, days: [] });
    months.at(-1)!.days.push(d);
  }

  return (
    <div className="flex flex-col gap-6">
      {months.map((g) => (
        <section key={g.title}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{g.title}</h3>
          <div className="flex flex-col gap-5">
            {g.days.map(([key, list]) => {
              const avg = list.reduce((s, e) => s + e.mood_value, 0) / list.length;
              return (
                <div key={key} id={`day-${key}`}>
                  <p className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-text-2">
                    {formatRelativeDay(key)}
                    <span className="font-normal text-muted">· {WEEKDAYS[weekdayIndex(fromKey(key))]}</span>
                    {list.length > 1 && (
                      <span className="ml-auto flex items-center gap-1 text-xs font-medium text-muted">
                        в среднем <MoodEmoji value={avg} size={16} />
                      </span>
                    )}
                  </p>
                  <ol className="relative">
                    {list.map((e, i) => (
                      <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
                        <div className="relative flex w-4 shrink-0 justify-center">
                          {i < list.length - 1 && <span className="absolute bottom-[-6px] top-7 w-[2px] rounded-full bg-accent/25" />}
                          <span className="relative mt-[22px] size-3 rounded-full border-[3px] bg-surface" style={{ borderColor: moodOf(e.mood_value).color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <EntryCard entry={e} own={own} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
