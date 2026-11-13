"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { summarize, fmtAvg, fmtPct, currentStreak } from "@/lib/stats";
import { moodOf } from "@/lib/mood";
import { MONTHS, plural } from "@/lib/dates";
import type { MoodEntry } from "@/lib/types";

/** Краткая статистика текущего месяца */
export function MonthSummary({ entries }: { entries: MoodEntry[] }) {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = entries.filter((e) => e.entry_date.startsWith(prefix));
  const s = summarize(month);
  const streak = currentStreak(entries);

  const tiles = [
    { label: "Отмечено", value: `${s.count}`, sub: plural(s.count, ["день", "дня", "дней"]) },
    { label: "Среднее", value: fmtAvg(s.avg), sub: s.avg ? moodOf(s.avg).emoji : "", emoji: true },
    { label: "Хороших", value: s.count ? fmtPct(s.positive) : "—", sub: "дней" },
  ];

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold capitalize tracking-tight">{MONTHS[now.getMonth()]}</h2>
        <Link href="/stats/" className="-mr-1 flex h-10 items-center gap-0.5 text-sm font-semibold text-accent">
          Подробнее <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-surface-2 px-3 py-3">
            <p className="text-xs font-medium text-muted">{t.label}</p>
            <p className="mt-1 flex items-baseline gap-1 text-[22px] font-extrabold tracking-tight">
              {t.value}
              <span className={`text-sm font-medium text-muted ${t.emoji ? "emoji" : ""}`}>{t.sub}</span>
            </p>
          </div>
        ))}
      </div>
      {streak >= 2 && (
        <p className="mt-3 text-sm text-text-2">
          🔥 {streak} {plural(streak, ["день", "дня", "дней"])} подряд с отметкой
        </p>
      )}
    </Card>
  );
}
