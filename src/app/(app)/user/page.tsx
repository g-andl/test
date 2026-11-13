"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, UserX, UserPlus, Check, Clock3, BellOff, Bell, UserMinus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/States";
import { MonthCalendar } from "@/components/diary/MonthCalendar";
import { DaySheet } from "@/components/diary/DaySheet";
import { StatsView } from "@/components/stats/StatsView";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, invalidate } from "@/lib/query";
import {
  fetchUserProfile, fetchFriendEntries, sendFriendRequest, acceptRequest, removeFriendship, setMuted, keys,
} from "@/lib/api";
import { moodOf, dayPartOf } from "@/lib/mood";
import { formatRelativeDay, formatTime } from "@/lib/dates";
import { humanError } from "@/lib/errors";
import type { EntryLite } from "@/lib/types";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

function UserProfile() {
  const params = useSearchParams();
  const username = (params.get("u") ?? "").toLowerCase();
  const router = useRouter();
  const { session } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const prof = useQuery(username ? keys.user(username) : null, () => fetchUserProfile(username));
  const p = prof.data;
  const canHistory = !!p && p.relation === "friends" && (p.can_see_calendar || p.can_see_stats);
  const entriesQ = useQuery(canHistory ? keys.friendEntries(p!.id) : null, () => fetchFriendEntries(p!.id));
  const entries = useMemo(() => entriesQ.data ?? [], [entriesQ.data]);
  const byDate = useMemo(() => new Map<string, EntryLite>(entries.map((e) => [e.entry_date, e])), [entries]);

  // Свой профиль открываем в разделе «Профиль»
  useEffect(() => {
    if (p?.relation === "self") router.replace("/profile/");
  }, [p?.relation, router]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      invalidate(keys.user(username), keys.friends, keys.requests, keys.activity);
      if (p) invalidate(keys.friendEntries(p.id));
      toast(ok);
      setMenu(false);
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (prof.loading) {
    return (
      <div className="flex flex-col gap-4 pt-10">
        <Skeleton className="mx-auto size-24 rounded-full" />
        <Skeleton className="mx-auto h-6 w-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (prof.error) return <ErrorState text={humanError(prof.error)} onRetry={prof.refetch} />;
  if (!p) return <EmptyState icon={<UserX />} title="Пользователь не найден" text="Возможно, он сменил имя или удалил аккаунт" />;

  const latest = p.latest;
  const lm = latest ? moodOf(latest.mood_value) : null;

  const action =
    p.relation === "friends" ? (
      <Button variant="secondary" onClick={() => setMenu(true)}>
        <Check className="size-5" /> В друзьях
      </Button>
    ) : p.relation === "outgoing" ? (
      <Button variant="secondary" loading={busy} onClick={() => act(() => removeFriendship(p.friendship_id!), "Заявка отменена")}>
        <Clock3 className="size-5" /> Отменить заявку
      </Button>
    ) : p.relation === "incoming" ? (
      <div className="flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => act(() => removeFriendship(p.friendship_id!), "Заявка отклонена")}>
          Отклонить
        </Button>
        <Button variant="accent" loading={busy} onClick={() => act(() => acceptRequest(p.friendship_id!), "Теперь вы друзья")}>
          Принять заявку
        </Button>
      </div>
    ) : (
      <Button variant="accent" loading={busy} onClick={() => act(() => sendFriendRequest(p.id), "Заявка отправлена")}>
        <UserPlus className="size-5" /> Добавить в друзья
      </Button>
    );

  return (
    <>
      <PageHeader back title="" bell={false} />
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center text-center">
            <Avatar src={p.avatar_url} name={p.display_name} size={96} />
            <h1 className="mt-3 text-[24px] font-extrabold tracking-tight">{p.display_name}</h1>
            <p className="text-muted">@{p.username}</p>
            <div className="mt-4">{action}</div>
            {p.is_muted && p.relation === "friends" && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><BellOff className="size-3.5" /> Уведомления отключены</p>
            )}
          </Card>

          {lm && latest && (
            <section className="rounded-[24px] p-5" style={{ background: lm.soft }}>
              <p className="text-sm font-semibold text-text-2">Последнее настроение</p>
              <div className="mt-2 flex items-center gap-3">
                <MoodEmoji value={lm.value} size={52} />
                <div>
                  <p className="text-[22px] font-extrabold" style={{ color: lm.color }}>{lm.label}</p>
                  <p className="text-sm text-text-2">
                    {formatRelativeDay(latest.entry_date)}, {dayPartOf(latest.day_part).label.toLowerCase()} · {formatTime(latest.mood_time)}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {p.relation !== "friends" ? (
            <Card>
              <EmptyState icon={<Lock />} title="Профиль виден только друзьям" text="Добавь пользователя в друзья, чтобы видеть его настроение" />
            </Card>
          ) : p.is_private ? (
            <Card>
              <EmptyState icon={<Lock />} title="Закрытый профиль" text={`${p.display_name} решил(а) не показывать своё настроение`} />
            </Card>
          ) : !canHistory ? (
            <Card className="flex items-center gap-3 text-sm text-text-2">
              <Lock className="size-5 shrink-0 text-muted" /> Календарь и статистика скрыты настройками приватности
            </Card>
          ) : entriesQ.loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : entriesQ.error ? (
            <ErrorState text={humanError(entriesQ.error)} onRetry={entriesQ.refetch} />
          ) : (
            <>
              {p.can_see_calendar && (
                <Card>
                  <CardTitle>Календарь</CardTitle>
                  <MonthCalendar year={ym.y} month={ym.m} onChange={(y, m) => setYm({ y, m })} byDate={byDate} onDayClick={setDay} />
                </Card>
              )}
              {p.can_see_stats && (
                <>
                  <h2 className="mt-2 text-[19px] font-bold tracking-tight">Статистика</h2>
                  <StatsView entries={entries} showInsights={false} />
                </>
              )}
            </>
          )}
        </div>
      </div>

      <DaySheet date={day} entry={day ? byDate.get(day) : null} onClose={() => setDay(null)} />

      <Sheet open={menu} onClose={() => setMenu(false)} title={p.display_name}>
        <div className="flex flex-col gap-2 pb-2">
          <button
            disabled={busy}
            onClick={() => act(() => setMuted(session!.user.id, p.id, !p.is_muted), p.is_muted ? "Уведомления включены" : "Уведомления отключены")}
            className="flex h-14 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left font-semibold"
          >
            {p.is_muted ? <Bell className="size-5" /> : <BellOff className="size-5" />}
            {p.is_muted ? "Включить уведомления от друга" : "Отключить уведомления от друга"}
          </button>
          <button
            disabled={busy}
            onClick={() => act(() => removeFriendship(p.friendship_id!), "Удалён из друзей")}
            className="flex h-14 items-center gap-3 rounded-2xl bg-danger-soft px-4 text-left font-semibold text-danger"
          >
            <UserMinus className="size-5" /> Удалить из друзей
          </button>
        </div>
      </Sheet>
    </>
  );
}

export default function UserPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}>
      <UserProfile />
    </Suspense>
  );
}
