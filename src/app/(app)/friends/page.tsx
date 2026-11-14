"use client";
import { useEffect, useState } from "react";
import { Search, Check, X, UserPlus, UserMinus, Clock3, Users, Inbox, Activity } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import type { FriendRow } from "@/lib/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/States";
import { UserRow } from "@/components/friends/UserRow";
import { MoodBadge } from "@/components/mood/MoodBadge";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useFriends } from "@/hooks/data";
import { useQuery, invalidate } from "@/lib/query";
import {
  fetchRequests, fetchActivity, searchUsers, sendFriendRequest, acceptRequest, removeFriendship, keys,
} from "@/lib/api";
import { moodOf } from "@/lib/mood";
import { formatRelativeDay, timeAgo } from "@/lib/dates";
import { humanError } from "@/lib/errors";

type Tab = "friends" | "requests" | "activity";

export default function FriendsPage() {
  const { session } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("friends");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FriendRow | null>(null);

  const friends = useFriends();
  const requests = useQuery(keys.requests, fetchRequests);
  const activity = useQuery(tab === "activity" ? keys.activity : null, fetchActivity);
  const search = useQuery(debounced.length >= 2 ? `search:${debounced}` : null, () => searchUsers(debounced, session!.user.id));

  // Открыть нужную вкладку по ссылке: /friends/?tab=activity
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- вкладка берётся из адреса
    if (t === "activity" || t === "requests") setTab(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim().toLowerCase().replace(/^@/, "")), 300);
    return () => clearTimeout(t);
  }, [q]);

  const incoming = requests.data?.filter((r) => r.direction === "incoming") ?? [];
  const outgoing = requests.data?.filter((r) => r.direction === "outgoing") ?? [];
  const friendIds = new Set(friends.data?.map((f) => f.id));
  const pendingIds = new Map(requests.data?.map((r) => [r.id, r]) ?? []);

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    if (busy) return;
    setBusy(id);
    try {
      await fn();
      invalidate(keys.friends, keys.requests, keys.activity, "search", "user");
      toast(ok);
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Вместе" title="Друзья" />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти по имени пользователя"
          aria-label="Поиск друзей"
          autoCapitalize="none"
          autoCorrect="off"
          className="h-13 w-full rounded-2xl bg-surface pl-12 pr-4 text-base shadow-card outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
        />
      </div>

      {debounced.length >= 2 ? (
        <section aria-label="Результаты поиска" className="flex flex-col gap-2">
          {search.loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : search.error ? (
            <ErrorState text={humanError(search.error)} onRetry={search.refetch} />
          ) : !search.data?.length ? (
            <EmptyState icon={<Search />} title="Никого не нашли" text="Проверь имя пользователя — например, masha_k" />
          ) : (
            search.data.map((u) => {
              const pending = pendingIds.get(u.id);
              return (
                <UserRow
                  key={u.id}
                  user={u}
                  href={`/user/?u=${u.username}`}
                  right={
                    friendIds.has(u.id) ? (
                      <span className="text-sm font-semibold text-success">В друзьях</span>
                    ) : pending?.direction === "outgoing" ? (
                      <span className="flex items-center gap-1 text-sm font-semibold text-muted"><Clock3 className="size-4" /> Заявка</span>
                    ) : pending?.direction === "incoming" ? (
                      <Button size="sm" loading={busy === u.id} onClick={() => act(u.id, () => acceptRequest(pending.friendship_id), "Теперь вы друзья")}>
                        Принять
                      </Button>
                    ) : (
                      <Button size="sm" variant="accent" loading={busy === u.id} onClick={() => act(u.id, () => sendFriendRequest(u.id), "Заявка отправлена")}>
                        <UserPlus className="size-4" /> Добавить
                      </Button>
                    )
                  }
                />
              );
            })
          )}
        </section>
      ) : (
        <>
          <Segmented
            ariaLabel="Раздел друзей"
            stretch
            className="mb-4"
            value={tab}
            onChange={setTab}
            options={[
              { value: "friends", label: `Друзья${friends.data?.length ? ` · ${friends.data.length}` : ""}` },
              { value: "requests", label: `Заявки${incoming.length ? ` · ${incoming.length}` : ""}` },
              { value: "activity", label: "Лента" },
            ]}
          />

          {tab === "friends" &&
            (friends.loading ? (
              <div className="flex flex-col gap-2"><Skeleton className="h-[72px]" /><Skeleton className="h-[72px]" /></div>
            ) : friends.error ? (
              <ErrorState text={humanError(friends.error)} onRetry={friends.refetch} />
            ) : !friends.data?.length ? (
              <EmptyState icon={<Users />} title="Пока нет друзей" text="Найди друзей по имени пользователя в поиске выше" />
            ) : (
              <ul className="grid gap-2 lg:grid-cols-2">
                {friends.data.map((f) => (
                  <li key={f.id}>
                    <UserRow
                      user={f}
                      href={`/user/?u=${f.username}`}
                      sub={
                        f.mood_value ? (
                          <span>
                            <span style={{ color: moodOf(f.mood_value).color }} className="font-semibold">{moodOf(f.mood_value).label}</span>
                            {" · "}
                            {f.entry_date && formatRelativeDay(f.entry_date) !== "Сегодня"
                              ? formatRelativeDay(f.entry_date)
                              : f.mood_updated_at ? timeAgo(f.mood_updated_at) : ""}
                          </span>
                        ) : (
                          `@${f.username}`
                        )
                      }
                      right={
                        <>
                          {f.mood_value ? <MoodBadge value={f.mood_value} size={40} /> : null}
                          <button
                            onClick={() => setRemoving(f)}
                            aria-label={`Удалить ${f.display_name} из друзей`}
                            title="Удалить из друзей"
                            className="flex size-10 items-center justify-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger active:scale-95"
                          >
                            <UserMinus className="size-[18px]" />
                          </button>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            ))}

          {tab === "requests" &&
            (requests.loading ? (
              <Skeleton className="h-[72px]" />
            ) : requests.error ? (
              <ErrorState text={humanError(requests.error)} onRetry={requests.refetch} />
            ) : !requests.data?.length ? (
              <EmptyState icon={<Inbox />} title="Заявок нет" text="Здесь появятся входящие и отправленные заявки" />
            ) : (
              <div className="flex flex-col gap-5">
                {incoming.length > 0 && (
                  <section>
                    <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Входящие</h2>
                    <ul className="flex flex-col gap-2">
                      {incoming.map((r) => (
                        <li key={r.friendship_id}>
                          <UserRow
                            user={r}
                            href={`/user/?u=${r.username}`}
                            sub={`@${r.username} · ${timeAgo(r.created_at)}`}
                            right={
                              <>
                                <button
                                  aria-label={`Отклонить заявку от ${r.display_name}`}
                                  disabled={!!busy}
                                  onClick={() => act(r.id, () => removeFriendship(r.friendship_id), "Заявка отклонена")}
                                  className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-text-2"
                                >
                                  <X className="size-5" />
                                </button>
                                <button
                                  aria-label={`Принять заявку от ${r.display_name}`}
                                  disabled={!!busy}
                                  onClick={() => act(r.id, () => acceptRequest(r.friendship_id), "Теперь вы друзья")}
                                  className="flex size-11 items-center justify-center rounded-full bg-accent text-white"
                                >
                                  <Check className="size-5" />
                                </button>
                              </>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {outgoing.length > 0 && (
                  <section>
                    <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Отправленные</h2>
                    <ul className="flex flex-col gap-2">
                      {outgoing.map((r) => (
                        <li key={r.friendship_id}>
                          <UserRow
                            user={r}
                            href={`/user/?u=${r.username}`}
                            sub={`Ожидает ответа · ${timeAgo(r.created_at)}`}
                            right={
                              <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => act(r.id, () => removeFriendship(r.friendship_id), "Заявка отменена")}>
                                Отменить
                              </Button>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            ))}

          {tab === "activity" &&
            (activity.loading ? (
              <Skeleton className="h-[72px]" />
            ) : activity.error ? (
              <ErrorState text={humanError(activity.error)} onRetry={activity.refetch} />
            ) : !activity.data?.length ? (
              <EmptyState icon={<Activity />} title="Пока тихо" text="Здесь появятся отметки друзей за последние две недели" />
            ) : (
              <ul className="flex flex-col gap-2 lg:max-w-2xl">
                {activity.data.map((a) => {
                  const m = moodOf(a.mood_value);
                  return (
                    <li key={a.entry_id + a.updated_at}>
                      <UserRow
                        user={a}
                        href={`/user/?u=${a.username}`}
                        sub={
                          <span>
                            {a.is_update ? "обновил(а) настроение: " : "отметил(а): "}
                            <b style={{ color: m.color }}>{m.label}</b> · {timeAgo(a.updated_at)}
                          </span>
                        }
                        right={<MoodBadge value={a.mood_value} size={40} />}
                      />
                    </li>
                  );
                })}
              </ul>
            ))}
        </>
      )}

      <Sheet
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Удалить из друзей?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRemoving(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy === removing?.id}
              onClick={async () => {
                if (!removing) return;
                await act(removing.id, () => removeFriendship(removing.friendship_id), "Удалён из друзей");
                setRemoving(null);
              }}
            >
              Удалить
            </Button>
          </div>
        }
      >
        <p className="text-text-2">
          {removing?.display_name} больше не будет видеть твоё настроение как друг, а ты — его. Добавить снова можно через поиск.
        </p>
      </Sheet>
    </>
  );
}
