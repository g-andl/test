// Расчёт статистики настроения на клиенте (данных немного — до 366 записей в год).
import type { DayPart, EntryLite, MoodValue } from "./types";
import { addDays, fromKey, toKey, weekdayIndex, WEEKDAYS_PLURAL, MONTHS_SHORT, plural } from "./dates";
import { DAY_PARTS, moodGroup } from "./mood";

export type PeriodId = "7" | "30" | "90" | "180" | "365" | "all";
export const PERIODS: { id: PeriodId; label: string; days: number | null }[] = [
  { id: "7", label: "7 дней", days: 7 },
  { id: "30", label: "30 дней", days: 30 },
  { id: "90", label: "90 дней", days: 90 },
  { id: "180", label: "6 месяцев", days: 182 },
  { id: "365", label: "Год", days: 365 },
  { id: "all", label: "Всё время", days: null },
];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const std = (xs: number[]) => {
  const m = avg(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

/** Записи в диапазоне дат [from, to] включительно */
export const inRange = (entries: EntryLite[], from: string, to: string) =>
  entries.filter((e) => e.entry_date >= from && e.entry_date <= to);

export interface PeriodRange {
  from: string;
  to: string;
  days: number;
  prevFrom: string | null;
  prevTo: string | null;
}

export function periodRange(id: PeriodId, entries: EntryLite[], today = new Date()): PeriodRange {
  const def = PERIODS.find((p) => p.id === id)!;
  const to = toKey(today);
  if (def.days === null) {
    const first = entries.reduce((m, e) => (e.entry_date < m ? e.entry_date : m), to);
    const days = Math.round((fromKey(to).getTime() - fromKey(first).getTime()) / 86400000) + 1;
    return { from: first, to, days, prevFrom: null, prevTo: null };
  }
  const from = toKey(addDays(today, -(def.days - 1)));
  const prevTo = toKey(addDays(today, -def.days));
  const prevFrom = toKey(addDays(today, -(def.days * 2 - 1)));
  return { from, to, days: def.days, prevFrom, prevTo };
}

export interface Summary {
  count: number;
  avg: number | null;
  mostFrequent: MoodValue | null;
  positive: number; // доля 0..1
  neutral: number;
  negative: number;
  distribution: Record<MoodValue, number>;
}

export function summarize(entries: EntryLite[]): Summary {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<MoodValue, number>;
  let pos = 0, neu = 0, neg = 0;
  for (const e of entries) {
    distribution[e.mood_value]++;
    const g = moodGroup(e.mood_value);
    if (g === "positive") pos++;
    else if (g === "neutral") neu++;
    else neg++;
  }
  const n = entries.length;
  let mostFrequent: MoodValue | null = null;
  // При равенстве выбираем более позитивное
  for (const v of [5, 4, 3, 2, 1] as MoodValue[]) {
    if (distribution[v] > 0 && (mostFrequent === null || distribution[v] > distribution[mostFrequent])) mostFrequent = v;
  }
  return {
    count: n,
    avg: avg(entries.map((e) => e.mood_value)),
    mostFrequent,
    positive: n ? pos / n : 0,
    neutral: n ? neu / n : 0,
    negative: n ? neg / n : 0,
    distribution,
  };
}

export interface WeekdayStat { index: number; avg: number | null; count: number }
export function byWeekday(entries: EntryLite[]): WeekdayStat[] {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const e of entries) buckets[weekdayIndex(fromKey(e.entry_date))].push(e.mood_value);
  return buckets.map((b, index) => ({ index, avg: avg(b), count: b.length }));
}

export interface DayPartStat {
  part: DayPart;
  avg: number | null;
  count: number;
  positive: number;
  negative: number;
}
export function byDayPart(entries: EntryLite[]): DayPartStat[] {
  return DAY_PARTS.map(({ value }) => {
    const xs = entries.filter((e) => e.day_part === value).map((e) => e.mood_value);
    return {
      part: value,
      avg: avg(xs),
      count: xs.length,
      positive: xs.filter((v) => v >= 4).length,
      negative: xs.filter((v) => v <= 2).length,
    };
  });
}

export interface SeriesPoint { key: string; label: string; value: number | null; count: number }

/** Ряд для графика: по дням (до 31 дня), по неделям (до полугода) или по месяцам */
export function series(entries: EntryLite[], range: PeriodRange): SeriesPoint[] {
  const map = new Map(entries.map((e) => [e.entry_date, e.mood_value]));
  const start = fromKey(range.from);
  const end = fromKey(range.to);
  const points: SeriesPoint[] = [];
  if (range.days <= 31) {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const k = toKey(d);
      const v = map.get(k) ?? null;
      points.push({ key: k, label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`, value: v, count: v ? 1 : 0 });
    }
    return points;
  }
  if (range.days <= 190) {
    let d = addDays(start, -weekdayIndex(start));
    while (d <= end) {
      const wEnd = addDays(d, 6);
      const xs = inRange(entries, toKey(d), toKey(wEnd)).map((e) => e.mood_value);
      points.push({
        key: toKey(d),
        label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`,
        value: xs.length ? Math.round(avg(xs)! * 100) / 100 : null,
        count: xs.length,
      });
      d = addDays(d, 7);
    }
    return points;
  }
  let d = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  while (d <= end) {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
    const xs = inRange(entries, toKey(d), toKey(addDays(next, -1))).map((e) => e.mood_value);
    const yearSuffix = range.days > 365 ? ` ${String(d.getFullYear()).slice(2)}` : "";
    points.push({
      key: toKey(d),
      label: `${MONTHS_SHORT[d.getMonth()]}${yearSuffix}`,
      value: xs.length ? Math.round(avg(xs)! * 100) / 100 : null,
      count: xs.length,
    });
    d = next;
  }
  return points;
}

/** Серия дней подряд (до сегодня или вчера) */
export function currentStreak(entries: EntryLite[], today = new Date()): number {
  const set = new Set(entries.map((e) => e.entry_date));
  let d = today;
  if (!set.has(toKey(d))) d = addDays(d, -1);
  let n = 0;
  while (set.has(toKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

const PART_IN: Record<DayPart, string> = { morning: "утром", day: "днём", evening: "вечером", night: "ночью" };

/**
 * Наблюдения. Каждое правило срабатывает только при достаточном объёме данных,
 * чтобы не делать выводов «на пустом месте».
 */
export function insights(all: EntryLite[], periodEntries: EntryLite[], today = new Date()): string[] {
  const out: string[] = [];
  const overall = avg(periodEntries.map((e) => e.mood_value));

  // Дни недели: нужно ≥14 записей и ≥2 записи в каждом сравниваемом дне
  if (overall !== null && periodEntries.length >= 14) {
    const wd = byWeekday(periodEntries).filter((w) => w.count >= 2 && w.avg !== null);
    if (wd.length >= 4) {
      const best = wd.reduce((a, b) => (b.avg! > a.avg! ? b : a));
      const worst = wd.reduce((a, b) => (b.avg! < a.avg! ? b : a));
      if (best.avg! - overall >= 0.4) out.push(`${cap(WEEKDAYS_PLURAL[best.index])} у тебя чаще хорошее настроение.`);
      if (overall - worst.avg! >= 0.4 && worst.index !== best.index)
        out.push(`${cap(WEEKDAYS_PLURAL[worst.index])} настроение обычно ниже среднего.`);
    }
  }

  // Время суток: часть суток с наибольшей долей хороших отметок (≥3 таких отметок)
  const parts = byDayPart(periodEntries).filter((p) => p.count >= 3);
  if (parts.length >= 2) {
    const best = parts.reduce((a, b) => (b.positive / b.count > a.positive / a.count ? b : a));
    if (best.positive >= 3 && best.positive / best.count >= 0.5)
      out.push(`Чаще всего ты отмечаешь хорошее настроение ${PART_IN[best.part]}.`);
    const sad = parts.reduce((a, b) => (b.negative / b.count > a.negative / a.count ? b : a));
    if (sad.negative >= 3 && sad.negative / sad.count >= 0.4 && sad.part !== best.part)
      out.push(`Грустные отметки чаще появляются ${PART_IN[sad.part]}.`);
  }

  // Тренд грустных отметок: последние 30 дней против предыдущих 30, в каждом окне ≥8 записей
  const last30 = inRange(all, toKey(addDays(today, -29)), toKey(today));
  const prev30 = inRange(all, toKey(addDays(today, -59)), toKey(addDays(today, -30)));
  if (last30.length >= 8 && prev30.length >= 8) {
    const a = last30.filter((e) => e.mood_value <= 2).length / last30.length;
    const b = prev30.filter((e) => e.mood_value <= 2).length / prev30.length;
    if (b - a >= 0.1) out.push("За последний месяц грустных отметок стало меньше.");
    else if (a - b >= 0.1) out.push("За последний месяц грустных отметок стало больше. Береги себя.");
  }

  // Стабильность: две недели против двух предыдущих, в каждом окне ≥7 записей
  const w2 = inRange(all, toKey(addDays(today, -13)), toKey(today)).map((e) => e.mood_value);
  const w2prev = inRange(all, toKey(addDays(today, -27)), toKey(addDays(today, -14))).map((e) => e.mood_value);
  if (w2.length >= 7 && w2prev.length >= 7) {
    const s1 = std(w2)!, s0 = std(w2prev)!;
    if (s0 > 0.3 && s1 <= s0 * 0.75) out.push("В последние две недели настроение было стабильнее.");
  }

  const streak = currentStreak(all, today);
  if (streak >= 3) out.push(`Ты отмечаешь настроение ${streak} ${plural(streak, ["день", "дня", "дней"])} подряд.`);

  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Форматирование среднего: 3.84 -> «3,8» */
export const fmtAvg = (v: number | null) => (v === null ? "—" : v.toFixed(1).replace(".", ","));
export const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
