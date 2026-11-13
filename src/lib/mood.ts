import type { DayPart, MoodValue } from "./types";

export interface MoodDef {
  value: MoodValue;
  emoji: string;
  label: string;
  /** Форма для фраз «чувствует себя …» */
  feel: string;
  description: string;
  color: string; // CSS-переменная основного цвета
  soft: string; // CSS-переменная мягкого фона
}

export const MOODS: MoodDef[] = [
  { value: 5, emoji: "😄", label: "Отлично", feel: "отлично", description: "Прекрасный день, много энергии", color: "var(--mood-5)", soft: "var(--mood-5-soft)" },
  { value: 4, emoji: "🙂", label: "Хорошо", feel: "хорошо", description: "В целом всё хорошо", color: "var(--mood-4)", soft: "var(--mood-4-soft)" },
  { value: 3, emoji: "😐", label: "Нейтрально", feel: "нейтрально", description: "Обычный день", color: "var(--mood-3)", soft: "var(--mood-3-soft)" },
  { value: 2, emoji: "😔", label: "Грустно", feel: "немного грустно", description: "Сегодня немного тяжело", color: "var(--mood-2)", soft: "var(--mood-2-soft)" },
  { value: 1, emoji: "😣", label: "Плохо", feel: "плохо", description: "Сложный день", color: "var(--mood-1)", soft: "var(--mood-1-soft)" },
];

export const moodOf = (v: number | null | undefined): MoodDef =>
  MOODS.find((m) => m.value === Math.round(Math.min(5, Math.max(1, v ?? 3)))) ?? MOODS[2];

/** Группа настроения для процентов */
export const moodGroup = (v: number): "positive" | "neutral" | "negative" =>
  v >= 4 ? "positive" : v === 3 ? "neutral" : "negative";

export const DAY_PARTS: { value: DayPart; label: string; short: string; range: string; hour: number }[] = [
  { value: "morning", label: "Утро", short: "Утром", range: "06:00–11:59", hour: 9 },
  { value: "day", label: "День", short: "Днём", range: "12:00–17:59", hour: 14 },
  { value: "evening", label: "Вечер", short: "Вечером", range: "18:00–23:59", hour: 20 },
  { value: "night", label: "Ночь", short: "Ночью", range: "00:00–05:59", hour: 2 },
];

export const dayPartOf = (v: DayPart) => DAY_PARTS.find((d) => d.value === v)!;

/** Часть суток по часу (локальное время) */
export function dayPartByHour(h: number): DayPart {
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "day";
  if (h >= 18) return "evening";
  return "night";
}
