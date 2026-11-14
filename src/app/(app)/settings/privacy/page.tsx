"use client";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { Skeleton, ErrorState } from "@/components/ui/States";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, setQueryData, invalidate } from "@/lib/query";
import { fetchPrivacy, updatePrivacy, keys } from "@/lib/api";
import { humanError } from "@/lib/errors";
import type { PrivacySettings } from "@/lib/types";

const MOOD_OPTIONS: { value: PrivacySettings["mood_visibility"]; label: string; text: string }[] = [
  { value: "latest", label: "Последнее настроение", text: "Друзья видят твою последнюю отметку" },
  { value: "today", label: "Только сегодняшнее", text: "Видно только, если ты отметил(а) настроение сегодня" },
  { value: "none", label: "Не показывать", text: "Друзья не видят текущее настроение" },
];

export default function PrivacyPage() {
  const { session } = useAuth();
  const toast = useToast();
  const q = useQuery(keys.privacy, fetchPrivacy);
  const s = q.data;

  async function set(patch: Partial<PrivacySettings>) {
    if (!s) return;
    const prev = s;
    setQueryData<PrivacySettings>(keys.privacy, (p) => ({ ...p!, ...patch })); // мгновенный отклик
    try {
      const saved = await updatePrivacy(session!.user.id, patch);
      setQueryData(keys.privacy, () => saved);
      invalidate(keys.friends);
    } catch (e) {
      setQueryData(keys.privacy, () => prev);
      toast(humanError(e), "error");
    }
  }

  const closed = s?.profile_visibility === "private";

  return (
    <>
      <PageHeader back title="Приватность" bell={false} />
      <div className="flex max-w-xl flex-col gap-4">
        {q.loading ? (
          <Skeleton className="h-80" />
        ) : q.error || !s ? (
          <ErrorState text={humanError(q.error)} onRetry={q.refetch} />
        ) : (
          <>
            <Card>
              <Toggle
                label="Закрытый профиль"
                description="Друзья видят только имя и аватар — ни настроения, ни календаря, ни статистики"
                checked={closed}
                onChange={(v) => set({ profile_visibility: v ? "private" : "friends" })}
              />
            </Card>

            <Card className={closed ? "pointer-events-none opacity-50" : ""} aria-disabled={closed}>
              <p className="mb-1 text-[15px] font-bold">Что видят друзья</p>
              <p className="mb-3 text-[13px] text-muted">Посторонние пользователи не видят ничего, кроме имени и аватара.</p>
              <div role="radiogroup" aria-label="Видимость настроения" className="mb-2 flex flex-col gap-2">
                {MOOD_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 ${s.mood_visibility === o.value ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2"}`}
                  >
                    <input
                      type="radio"
                      name="mood_visibility"
                      className="size-5 accent-[var(--accent)]"
                      checked={s.mood_visibility === o.value}
                      onChange={() => set({ mood_visibility: o.value })}
                    />
                    <span>
                      <span className="block text-[15px] font-semibold">{o.label}</span>
                      <span className="block text-[13px] text-muted">{o.text}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="divide-y divide-line">
                <Toggle label="Календарь" description="История настроения по дням" checked={s.calendar_visibility} onChange={(v) => set({ calendar_visibility: v })} />
                <Toggle label="Статистика" description="Средние значения, распределение, дни недели" checked={s.statistics_visibility} onChange={(v) => set({ statistics_visibility: v })} />
                <Toggle label="Заметки" description="По умолчанию видны только тебе" checked={s.notes_visibility} onChange={(v) => set({ notes_visibility: v })} />
                <Toggle label="Фотографии" description="По умолчанию видны только тебе" checked={s.photos_visibility} onChange={(v) => set({ photos_visibility: v })} />
              </div>
            </Card>
            <p className="px-2 text-xs text-muted">
              Ограничения проверяются на сервере: даже при прямом запросе к базе скрытые данные недоступны.
            </p>
          </>
        )}
      </div>
    </>
  );
}
