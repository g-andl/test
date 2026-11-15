"use client";
import { Users, Globe, Lock, Heart, NotebookPen } from "lucide-react";
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
              <div className={`mt-2 divide-y divide-line ${s.public_visibility === "none" ? "pointer-events-none opacity-50" : ""}`}>
                <Toggle
                  label="Показывать заметки"
                  description="Текст заметок в твоих отметках. Друзья видят заметки всегда"
                  checked={s.notes_public}
                  disabled={s.public_visibility === "none"}
                  onChange={(v) => set({ notes_public: v })}
                />
                <Toggle
                  label="Показывать фото"
                  description="Фото в твоих отметках. Друзья видят фото всегда"
                  checked={s.photos_public}
                  disabled={s.public_visibility === "none"}
                  onChange={(v) => set({ photos_public: v })}
                />
              </div>
              {(!s.notes_public || !s.photos_public) && s.public_visibility !== "none" && (
                <p className="mt-3 flex gap-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-[13px] text-text-2">
                  <Lock className="mt-0.5 size-4 shrink-0" />
                  Скрытые заметки и фото другие увидят как «скрыто»: будет понятно, что они есть, но прочитать или посмотреть их нельзя.
                </p>
              )}
            </Card>
            <Card>
              <p className="mb-1 flex items-center gap-2 text-[15px] font-bold">
                <Heart className="size-[18px] text-danger" /> Окно поддержки
              </p>
              <p className="mb-3 text-[13px] text-muted">Тёплые слова от других пользователей. Любое сообщение ты можешь удалить.</p>

              <p className="mb-2 text-sm font-semibold text-text-2">Кто может писать</p>
              <div role="radiogroup" aria-label="Кто может писать в окно поддержки" className="mb-4 flex flex-wrap gap-2">
                {([["all", "Все"], ["friends", "Только друзья"], ["none", "Никто"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={s.support_write === v}
                    onClick={() => set({ support_write: v })}
                    className={`h-10 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${s.support_write === v ? "bg-accent text-white" : "bg-surface-2 text-text-2"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="mb-2 text-sm font-semibold text-text-2">Кто видит сообщения</p>
              <div role="radiogroup" aria-label="Кто видит сообщения в окне поддержки" className="flex flex-wrap gap-2">
                {([["all", "Все"], ["friends", "Только друзья"], ["owner", "Только я"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={s.support_view === v}
                    onClick={() => set({ support_view: v })}
                    className={`h-10 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${s.support_view === v ? "bg-accent text-white" : "bg-surface-2 text-text-2"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {s.support_view === "owner" && s.support_write !== "none" && (
                <p className="mt-3 rounded-2xl bg-surface-2 px-3 py-2.5 text-[13px] text-text-2">
                  Писать смогут, а увидишь сообщения только ты — получится личный ящик тёплых слов.
                </p>
              )}
            </Card>
            <Card>
              <p className="mb-1 flex items-center gap-2 text-[15px] font-bold">
                <NotebookPen className="size-[18px] text-muted" /> Заметки в дневнике
              </p>
              <p className="mb-3 text-[13px] text-muted">Свободные записи из раздела «Заметки». По умолчанию их видишь только ты.</p>
              <div role="radiogroup" aria-label="Кто читает заметки дневника" className="flex flex-wrap gap-2">
                {([["me", "Только я"], ["friends", "Друзья"], ["all", "Все"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={s.journal_visibility === v}
                    onClick={() => set({ journal_visibility: v })}
                    className={`h-10 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${s.journal_visibility === v ? "bg-accent text-white" : "bg-surface-2 text-text-2"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {s.journal_visibility !== "me" && (
                <p className="mt-3 rounded-2xl bg-surface-2 px-3 py-2.5 text-[13px] text-text-2">
                  {s.journal_visibility === "friends" ? "Заметки смогут читать твои друзья." : "Заметки смогут читать все пользователи сервиса."} Администратор заметки не читает.
                </p>
              )}
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
