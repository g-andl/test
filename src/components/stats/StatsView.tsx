"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Sparkles, TrendingDown, TrendingUp, Minus, BarChart3 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton, EmptyState } from "@/components/ui/States";
import {
  PERIODS, periodRange, inRange, summarize, byWeekday, byDayPart, series, insights,
  fmtAvg, fmtPct, type PeriodId,
} from "@/lib/stats";
import { MOODS, moodOf, DAY_PARTS } from "@/lib/mood";
import { WEEKDAYS, plural } from "@/lib/dates";
import type { EntryLite } from "@/lib/types";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

// Recharts загружается только на экране статистики
const DynamicsChart = dynamic(() => import("./Charts").then((m) => m.DynamicsChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[220px]" />,
});
const WeekdayChart = dynamic(() => import("./Charts").then((m) => m.WeekdayChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[200px]" />,
});

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur === null || prev === null) return <span className="text-xs text-muted">нет данных для сравнения</span>;
  const d = cur - prev;
  const Icon = Math.abs(d) < 0.05 ? Minus : d > 0 ? TrendingUp : TrendingDown;
  const color = Math.abs(d) < 0.05 ? "text-muted" : d > 0 ? "text-success" : "text-danger";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
      <Icon className="size-3.5" /> {d > 0 ? "+" : ""}{d.toFixed(1).replace(".", ",")} к прошлому периоду
    </span>
  );
}

/**
 * Полная статистика по набору записей.
 * Используется и для своих записей, и на странице друга (без наблюдений и итогов месяца).
 */
export function StatsView({
  entries,
  allEntries,
  showInsights = true,
  extra,
}: {
  entries: EntryLite[];
  allEntries?: EntryLite[];
  showInsights?: boolean;
  extra?: React.ReactNode;
}) {
  const [period, setPeriod] = useState<PeriodId>("30");
  const all = allEntries ?? entries;

  const data = useMemo(() => {
    const range = periodRange(period, all);
    const cur = inRange(all, range.from, range.to);
    const prev = range.prevFrom ? inRange(all, range.prevFrom, range.prevTo!) : [];
    return {
      range,
      cur,
      s: summarize(cur),
      prevS: range.prevFrom ? summarize(prev) : null,
      weekdays: byWeekday(cur),
      parts: byDayPart(cur),
      points: series(cur, range),
      notes: showInsights ? insights(all, cur) : [],
    };
  }, [period, all, showInsights]);

  const { s, prevS, range } = data;
  const top = s.mostFrequent ? moodOf(s.mostFrequent) : null;
  const wdWithData = data.weekdays.filter((w) => w.count > 0 && w.avg !== null);
  const bestWd = wdWithData.length >= 2 ? wdWithData.reduce((a, b) => (b.avg! > a.avg! ? b : a)) : null;
  const worstWd = wdWithData.length >= 2 ? wdWithData.reduce((a, b) => (b.avg! < a.avg! ? b : a)) : null;

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        ariaLabel="Период"
        value={period}
        onChange={setPeriod}
        options={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
      />

      {s.count === 0 ? (
        <Card>
          <EmptyState icon={<BarChart3 />} title="За этот период нет отметок" text="Выбери другой период или начни отмечать настроение каждый день" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Общая статистика */}
          <Card className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl bg-surface-2 p-3.5">
                <p className="text-xs font-medium text-muted">Дней с отметкой</p>
                <p className="mt-1 text-[24px] font-extrabold tracking-tight">{s.days}</p>
                <p className="text-xs text-muted">
                  из {range.days} · {s.count} {plural(s.count, ["отметка", "отметки", "отметок"])}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3.5">
                <p className="text-xs font-medium text-muted">Среднее</p>
                <p className="mt-1 flex items-center gap-1.5 text-[24px] font-extrabold tracking-tight">
                  {fmtAvg(s.avg)} {s.avg ? <MoodEmoji value={s.avg} size={24} /> : null}
                </p>
                <p className="text-xs text-muted">по шкале от 1 до 5</p>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3.5">
                <p className="text-xs font-medium text-muted">Чаще всего</p>
                <p className="mt-1 flex items-center gap-1.5 text-[19px] font-extrabold tracking-tight">
                  {top && <MoodEmoji value={top.value} size={24} />} {top?.label}
                </p>
                <p className="text-xs text-muted">{s.mostFrequent ? `${s.distribution[s.mostFrequent]} ${plural(s.distribution[s.mostFrequent], ["раз", "раза", "раз"])}` : ""}</p>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3.5">
                <p className="text-xs font-medium text-muted">Хороших дней</p>
                <p className="mt-1 text-[24px] font-extrabold tracking-tight">{fmtPct(s.positive)}</p>
                <p className="text-xs text-muted">«отлично» и «хорошо»</p>
              </div>
            </div>

            {/* Доли: позитивные / нейтральные / негативные */}
            <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
              {s.positive > 0 && <span style={{ width: `${s.positive * 100}%`, background: "var(--mood-5)" }} />}
              {s.neutral > 0 && <span style={{ width: `${s.neutral * 100}%`, background: "var(--mood-3)" }} />}
              {s.negative > 0 && <span style={{ width: `${s.negative * 100}%`, background: "var(--mood-1)" }} />}
            </div>
            <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-2">
              {[
                ["Положительные", s.positive, "var(--mood-5)"],
                ["Нейтральные", s.neutral, "var(--mood-3)"],
                ["Отрицательные", s.negative, "var(--mood-1)"],
              ].map(([label, val, color]) => (
                <div key={label as string} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: color as string }} />
                  <dt>{label as string}</dt>
                  <dd className="font-bold text-text">{fmtPct(val as number)}</dd>
                </div>
              ))}
            </dl>
            {prevS && (
              <div className="mt-3">
                <Delta cur={s.avg} prev={prevS.count ? prevS.avg : null} />
              </div>
            )}
          </Card>

          {/* Динамика */}
          <Card className="lg:col-span-2">
            <CardTitle>Динамика</CardTitle>
            <DynamicsChart data={data.points} aggregated={range.days > 31} />
            <p className="mt-2 text-xs text-muted">
              {range.days > 190 ? "Среднее по месяцам" : range.days > 31 ? "Среднее по неделям" : "По дням"} · нажми на точку, чтобы увидеть детали
            </p>
          </Card>

          {/* Распределение */}
          <Card>
            <CardTitle>Распределение</CardTitle>
            <ul className="flex flex-col gap-3">
              {MOODS.map((m) => {
                const n = s.distribution[m.value];
                const share = s.count ? n / s.count : 0;
                return (
                  <li key={m.value} className="flex items-center gap-3">
                    <MoodEmoji value={m.value} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex justify-between text-[13px]">
                        <span className="font-semibold">{m.label}</span>
                        <span className="text-text-2">
                          {n} · <b className="text-text">{fmtPct(share)}</b>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-2">
                        <div className="h-2 rounded-full" style={{ width: `${Math.max(share * 100, n ? 3 : 0)}%`, background: m.color }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Дни недели */}
          <Card>
            <CardTitle>Дни недели</CardTitle>
            <WeekdayChart data={data.weekdays} overall={s.avg} />
            {bestWd && worstWd && bestWd.index !== worstWd.index && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                <div className="rounded-2xl bg-surface-2 p-3">
                  <p className="text-muted">Лучший день</p>
                  <p className="font-bold capitalize">{WEEKDAYS[bestWd.index]} <MoodEmoji value={bestWd.avg!} size={18} className="align-[-3px]" /></p>
                </div>
                <div className="rounded-2xl bg-surface-2 p-3">
                  <p className="text-muted">Сложнее всего</p>
                  <p className="font-bold capitalize">{WEEKDAYS[worstWd.index]} <MoodEmoji value={worstWd.avg!} size={18} className="align-[-3px]" /></p>
                </div>
              </div>
            )}
          </Card>

          {/* Время суток */}
          <Card className="lg:col-span-2">
            <CardTitle>Время суток</CardTitle>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {data.parts.map((p) => {
                const def = DAY_PARTS.find((d) => d.value === p.part)!;
                const m = p.avg ? moodOf(p.avg) : null;
                return (
                  <li key={p.part} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface-2 p-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-muted"
                        style={{ background: m ? m.soft : "var(--surface-3)" }}
                      >
                        {m ? <MoodEmoji value={m.value} size={30} /> : "·"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold">{def.label}</p>
                        <p className="whitespace-nowrap text-xs text-muted">{def.range}</p>
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-t border-line pt-2.5">
                      <p className="text-[17px] font-extrabold">{fmtAvg(p.avg)}</p>
                      <p className="whitespace-nowrap text-xs text-muted">{p.count} {plural(p.count, ["отметка", "отметки", "отметок"])}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {(() => {
              const withData = data.parts.filter((p) => p.count >= 2);
              if (withData.length < 2) return <p className="mt-3 text-xs text-muted">Сравнение появится, когда отметок в разное время суток станет больше.</p>;
              const best = withData.reduce((a, b) => (b.avg! > a.avg! ? b : a));
              const worst = withData.reduce((a, b) => (b.avg! < a.avg! ? b : a));
              if (best.part === worst.part) return null;
              const name = (p: string) => DAY_PARTS.find((d) => d.value === p)!.short.toLowerCase();
              return (
                <p className="mt-3 text-[13px] text-text-2">
                  Лучше всего настроение <b className="text-text">{name(best.part)}</b>, грустнее — <b className="text-text">{name(worst.part)}</b>.
                </p>
              );
            })()}
          </Card>
        </div>
      )}

      {showInsights && (
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2"><Sparkles className="size-5 text-accent" /> Наблюдения</span>
          </CardTitle>
          {data.notes.length ? (
            <ul className="flex flex-col gap-2">
              {data.notes.map((n) => (
                <li key={n} className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px] font-medium text-text">{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Пока мало данных для выводов. Отмечай настроение хотя бы пару недель — и здесь появятся закономерности.
            </p>
          )}
        </Card>
      )}
      {extra}
    </div>
  );
}
