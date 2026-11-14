"use client";
import { Users, Globe, Lock } from "lucide-react";
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

const OPTIONS: { value: PrivacySettings["public_visibility"]; label: string; text: string }[] = [
  { value: "all", label: "Видят всё", text: "Настроение, заметки, календарь и статистику" },
  { value: "latest", label: "Только последнее", text: "Видна только твоя последняя отметка" },
  { value: "none", label: "Ничего — закрытый профиль", text: "Только имя и аватар" },
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
      invalidate("user");
    } catch (e) {
      setQueryData(keys.privacy, () => prev);
      toast(humanError(e), "error");
    }
  }

  return (
    <>
      <PageHeader back title="Приватность" bell={false} />
      <div className="flex max-w-xl flex-col gap-4">
        <Card className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Users className="size-5" />
          </span>
          <div>
            <p className="text-[15px] font-bold">Друзья видят всё</p>
            <p className="text-[13px] text-muted">
              Настроение, заметки, фото, календарь и статистику. Если не хочешь делиться с кем-то — удали его из друзей.
            </p>
          </div>
        </Card>

        {q.loading ? (
          <Skeleton className="h-72" />
        ) : q.error || !s ? (
          <ErrorState text={humanError(q.error)} onRetry={q.refetch} />
        ) : (
          <>
            <Card>
              <p className="mb-1 flex items-center gap-2 text-[15px] font-bold">
                <Globe className="size-[18px] text-muted" /> Остальные пользователи
              </p>
              <p className="mb-3 text-[13px] text-muted">Те, кто нашёл тебя через поиск, но не в друзьях.</p>
              <div role="radiogroup" aria-label="Что видят остальные" className="flex flex-col gap-2">
                {OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 ${s.public_visibility === o.value ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2"}`}
                  >
                    <input
                      type="radio"
                      name="public_visibility"
                      className="size-5 shrink-0 accent-[var(--accent)]"
                      checked={s.public_visibility === o.value}
                      onChange={() => set({ public_visibility: o.value })}
                    />
                    <span>
                      <span className="block text-[15px] font-semibold">{o.label}</span>
                      <span className="block text-[13px] text-muted">{o.text}</span>
                    </span>
                  </label>
                ))}
              </div>
              {s.public_visibility === "all" && (
                <p className="mt-3 flex gap-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-[13px] text-text-2">
                  <Lock className="mt-0.5 size-4 shrink-0" /> Заметки будут видны всем, кто найдёт тебя по имени пользователя.
                </p>
              )}
              <div className={`mt-2 ${s.public_visibility === "none" ? "pointer-events-none opacity-50" : ""}`}>
                <Toggle
                  label="Показывать фото"
                  description="По умолчанию фото видят только друзья"
                  checked={s.photos_public}
                  disabled={s.public_visibility === "none"}
                  onChange={(v) => set({ photos_public: v })}
                />
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
