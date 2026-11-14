"use client";
import { useMemo } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useQuery } from "@/lib/query";
import { fetchMyEntries, fetchFriends, fetchUnreadCount, keys, photoUrl } from "@/lib/api";
import { aggregateByDay } from "@/lib/stats";

/**
 * Все мои записи (новые сверху).
 * byDate — отметки по дням (внутри дня по времени), dayAgg — среднее за день.
 */
export function useMyEntries() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const q = useQuery(uid ? keys.entries(uid) : null, () => fetchMyEntries(uid!));
  const entries = useMemo(() => q.data ?? [], [q.data]);
  const byDate = useMemo(() => groupByDate(entries), [entries]);
  const dayAgg = useMemo(() => aggregateByDay(entries), [entries]);
  return { ...q, entries, byDate, dayAgg };
}

/** Группировка по дню; внутри дня — по времени настроения */
export function groupByDate<T extends { entry_date: string; mood_time: string }>(entries: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of entries) {
    const list = m.get(e.entry_date) ?? [];
    list.push(e);
    m.set(e.entry_date, list);
  }
  m.forEach((list) => list.sort((a, b) => a.mood_time.localeCompare(b.mood_time)));
  return m;
}

export function useFriends() {
  return useQuery(keys.friends, fetchFriends);
}

export function useUnread() {
  const { session } = useAuth();
  return useQuery(session ? keys.unread : null, fetchUnreadCount);
}

/** Подписанная ссылка на приватное фото */
export function usePhoto(path: string | null | undefined) {
  return useQuery(path ? keys.photo(path) : null, () => photoUrl(path!));
}
