"use client";
import { EntryCard } from "./EntryCard";
import { formatRelativeDay, fromKey, WEEKDAYS, weekdayIndex, MONTHS } from "@/lib/dates";
import { moodOf } from "@/lib/mood";
import type { EntryLite } from "@/lib/types";

/** Лента записей: вертикальная линия с точками, группировка по месяцам */
export function Timeline({ entries, onOpen }: { entries: EntryLite[]; onOpen?: (e: EntryLite) => void }) {
  const groups: { title: string; items: EntryLite[] }[] = [];
  for (const e of entries) {
    const d = fromKey(e.entry_date);
    const title = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (groups.at(-1)?.title !== title) groups.push({ title, items: [] });
    groups.at(-1)!.items.push(e);
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.title}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{g.title}</h3>
          <ol className="relative">
            {g.items.map((e, i) => {
              const m = moodOf(e.mood_value);
              const d = fromKey(e.entry_date);
              return (
                <li key={e.id} id={`entry-${e.entry_date}`} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* Линия и точка */}
                  <div className="relative flex w-5 shrink-0 justify-center">
                    {i < g.items.length - 1 && <span className="absolute bottom-[-8px] top-6 w-[2px] rounded-full bg-accent/25" />}
                    <span className="relative mt-[18px] size-3.5 rounded-full border-[3px] bg-surface" style={{ borderColor: m.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 text-[13px] font-semibold text-text-2">
                      {formatRelativeDay(e.entry_date)}
                      <span className="font-normal text-muted"> · {WEEKDAYS[weekdayIndex(d)]}</span>
                    </p>
                    <EntryCard entry={e} onClick={onOpen ? () => onOpen(e) : undefined} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
