"use client";
// Лёгкий кэш запросов: мгновенно показывает прошлые данные при переходах
// между экранами и обновляет их в фоне. Без тяжёлых библиотек.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Entry = { data?: unknown; error?: unknown; promise?: Promise<unknown>; at: number };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/** Сбросить кэш по префиксу ключа — данные перезагрузятся у подписчиков */
export function invalidate(...prefixes: string[]) {
  for (const key of [...cache.keys()]) {
    if (prefixes.some((p) => key === p || key.startsWith(p + ":"))) cache.delete(key);
  }
  emit();
}

export function clearCache() {
  cache.clear();
  emit();
}

export function setQueryData<T>(key: string, updater: (prev: T | undefined) => T) {
  const prev = cache.get(key);
  cache.set(key, { data: updater(prev?.data as T | undefined), at: Date.now() });
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>) {
  useSyncExternalStore(subscribe, () => version, () => version);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const [, force] = useState(0);

  const load = useCallback(
    (k: string) => {
      const existing = cache.get(k);
      if (existing?.promise) return existing.promise;
      const promise = fetcherRef.current().then(
        (data) => {
          cache.set(k, { data, at: Date.now() });
          emit();
          return data;
        },
        (error) => {
          cache.set(k, { data: existing?.data, error, at: Date.now() });
          emit();
          throw error;
        },
      );
      cache.set(k, { ...(existing ?? { at: 0 }), promise });
      return promise;
    },
    [],
  );

  const entry = key ? cache.get(key) : undefined;

  useEffect(() => {
    if (!key) return;
    const e = cache.get(key);
    // Перезагружаем, если данных нет или они старше 30 секунд
    if (!e || (!e.promise && Date.now() - e.at > 30_000)) load(key).catch(() => undefined);
  }, [key, load, entry]);

  const refetch = useCallback(() => {
    if (!key) return Promise.resolve(undefined);
    cache.delete(key);
    force((n) => n + 1);
    return load(key).catch(() => undefined);
  }, [key, load]);

  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: !!key && entry?.data === undefined && !entry?.error,
    refetch,
  };
}
