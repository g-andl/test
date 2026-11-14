"use client";
import { useQuery } from "@/lib/query";
import { fetchBadgeData, keys } from "@/lib/api";
import type { Badge } from "@/lib/types";

/** Цвет администратора: акцент приложения */
const ADMIN_COLOR = "#4d8df7";

/** Цветная пометка: фон — мягкая заливка цвета, текст — тот же цвет, смешанный с цветом текста темы (читается в обеих темах) */
export function BadgePill({ name, color, hint, className = "" }: { name: string; color: string; hint?: string | null; className?: string }) {
  return (
    <span
      title={hint ?? undefined}
      className={`inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 ${className}`}
      style={{
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color: `color-mix(in srgb, ${color} 72%, var(--text))`,
      }}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Все статусы и кто какой имеет — один маленький запрос на всё приложение */
export function useBadges() {
  return useQuery(keys.badges, fetchBadgeData);
}

/** Пометка рядом с именем: «Администратор» или выданный статус. Ничего не рисует, если статуса нет. */
export function StatusBadge({ userId, isAdmin, className = "" }: { userId?: string | null; isAdmin?: boolean; className?: string }) {
  const { data } = useBadges();
  if (isAdmin) return <BadgePill name="Администратор" color={ADMIN_COLOR} className={className} />;
  const b: Badge | undefined = userId ? data?.byUser[userId] : undefined;
  return b ? <BadgePill name={b.name} color={b.color} hint={b.hint} className={className} /> : null;
}
