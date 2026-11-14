"use client";
import { useMemo } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useQuery } from "@/lib/query";
import { fetchMyEntries, fetchFriends, fetchUnreadCount, keys, photoUrl } from "@/lib/api";
import type { MoodEntry } from "@/lib/types";

/** Все мои записи (новые сверху) и индекс по дате */
export function useMyEntries() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const q = useQuery(uid ? keys.entries(uid) : null, () => fetchMyEntries(uid!));
  const byDate = useMemo(() => {
    const m = new Map<string, MoodEntry>();
    q.data?.forEach((e) => m.set(e.entry_date, e));
    return m;
  }, [q.data]);
  return { ...q, entries: q.data ?? [], byDate };
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
