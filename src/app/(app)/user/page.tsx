"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ShieldCheck, UserPlus, Check, Clock3, BellOff, Bell, UserMinus, CalendarDays, BarChart3, Eye, ChevronLeft, ChevronRight, ChevronDown, NotebookPen, Sunrise } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/States";
import { MonthCalendar } from "@/components/diary/MonthCalendar";
import { EntryCard } from "@/components/diary/EntryCard";
import { MoodCard } from "@/components/mood/MoodCard";
import { ReflectionSummary } from "@/components/reflection/ReflectionStats";
import { JournalReadList } from "@/components/journal/JournalNotes";
import { StatsView } from "@/components/stats/StatsView";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { SupportWallCard } from "@/components/support/SupportWall";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, invalidate } from "@/lib/query";
import {
  fetchUserProfile, fetchUserEntries, fetchJournal, fetchJournalGroups, fetchReflections, sendFriendRequest, acceptRequest, removeFriendship, setMuted, keys,
} from "@/lib/api";
import { moodOf } from "@/lib/mood";
import { capitalize, formatLong, formatRelativeDay, formatTime, fromKey } from "@/lib/dates";
import { aggregateByDay } from "@/lib/stats";
import { humanError } from "@/lib/errors";
import { groupByDate } from "@/hooks/data";
import type { EntryLite } from "@/lib/types";

/** Карточки последних отметок: листаются пальцем на телефоне, стрелками на компьютере */
function EntryCarousel({ entries }: { entries: EntryLite[] }) {
  const [el, setEl] = useState<HTMLUListElement | null>(null);
  const scroll = (dir: number) => el?.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  return (
    <div className="relative">
      <ul
        ref={setEl}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 pb-1 min-[380px]:-mx-5 min-[380px]:px-5 lg:mx-0 lg:px-0"
      >
        {entries.map((e) => (
          <li key={e.id} className={entries.length === 1 ? "w-full shrink-0" : "w-[82%] shrink-0 snap-center sm:w-[56%] lg:w-[calc(50%-6px)]"}>
            <MoodCard entry={e} />
          </li>
        ))}
      </ul>
      {entries.length > 2 && (
        <div className="mt-2 hidden justify-end gap-2 lg:flex">
          <button onClick={() => scroll(-1)} aria-label="Назад" className="flex size-10 items-center justify-center rounded-full bg-surface shadow-card">
            <ChevronLeft className="size-5" />
          </button>
          <button onClick={() => scroll(1)} aria-label="Вперёд" className="flex size-10 items-center justify-center rounded-full bg-surface shadow-card">
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function UserProfile() {
  const params = useSearchParams();
  const username = (params.get("u") ?? "").toLowerCase();
  const router = useRouter();
  const { session } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [friendMenu, setFriendMenu] = useState(false);
  const [showMood, setShowMood] = useState(false);
  const [panel, setPanel] = useState<"calendar" | "stats" | "notes" | "days" | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const prof = useQuery(username ? keys.user(username) : null, () => fetchUserProfile(username));
  const p = prof.data;
  // Записи грузим только когда пользователь сам захотел посмотреть
  const wantEntries = !!p && p.access !== "none" && (showMood || panel === "calendar" || panel === "stats");
  // Заметки дневника: база отдаёт их только если автор открыл (друзьям или всем)
  const notesQ = useQuery(p && !p.is_admin ? keys.journal(p.id) : null, () => fetchJournal(p!.id));
  const notes = notesQ.data ?? [];
  // Итоги дней: база отдаёт их, только если автор не закрыл (по умолчанию открыты)
  const daysQ = useQuery(p && !p.is_admin ? keys.reflections(p.id) : null, () => fetchReflections(p!.id));
  const days = daysQ.data ?? [];
  const groupsQ = useQuery(p && !p.is_admin && notes.length > 0 ? keys.journalGroups(p.id) : null, () => fetchJournalGroups(p!.id));
  const entriesQ = useQuery(wantEntries ? keys.userEntries(p!.id) : null, () => fetchUserEntries(p!.id));
  const entries = useMemo(() => entriesQ.data ?? [], [entriesQ.data]);
  const dayAgg = useMemo(() => aggregateByDay(entries), [entries]);
  const byDate = useMemo(() => groupByDate(entries), [entries]);

  useEffect(() => {
    if (p?.relation === "self") router.replace("/profile/");
  }, [p?.relation, router]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      invalidate(keys.user(username), keys.friends, keys.requests, keys.activity, "muted");
      if (p) invalidate(keys.userEntries(p.id));
      toast(ok);
      setConfirmRemove(false);
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
  if (!p) return <EmptyState icon={<Lock />} title="Пользователь не найден" text="Возможно, он сменил имя или удалил аккаунт" />;

  const isFriend = p.relation === "friends";
  const latest = p.latest;
  const lm = latest ? moodOf(latest.mood_value) : null;

  const relationAction = p.is_admin ? (
    <span className="flex h-11 items-center gap-1.5 rounded-2xl bg-accent-soft px-4 text-sm font-semibold text-accent">
      <ShieldCheck className="size-4" /> Администратор сервиса
    </span>
  ) : isFriend ? (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFriendMenu(true)}
          aria-haspopup="dialog"
          className="flex h-11 items-center gap-1.5 rounded-2xl bg-accent-soft pl-4 pr-3 text-sm font-semibold text-accent transition active:scale-95"
        >
          <Check className="size-4" /> В друзьях <ChevronDown className="size-4 opacity-70" />
        </button>
        <button
          onClick={() => act(() => setMuted(session!.user.id, p.id, !p.is_muted), p.is_muted ? "Уведомления включены" : "Уведомления отключены")}
          disabled={busy}
          aria-label={p.is_muted ? "Включить уведомления от друга" : "Отключить уведомления от друга"}
          title={p.is_muted ? "Включить уведомления" : "Отключить уведомления"}
          className={`flex size-11 items-center justify-center rounded-2xl transition active:scale-95 ${p.is_muted ? "bg-surface-2 text-muted" : "bg-surface-2 text-text"}`}
        >
          {p.is_muted ? <BellOff className="size-5" /> : <Bell className="size-5" />}
        </button>
      </div>
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
      <div className="flex flex-col gap-4 lg:max-w-3xl">
        <Card className="flex flex-col items-center text-center">
          <Avatar src={p.avatar_url} name={p.display_name} size={88} />
          <h1 className="mt-3 text-[24px] font-extrabold tracking-tight">{p.display_name}</h1>
          <p className="text-muted">@{p.username}</p>
          <StatusBadge userId={p.id} isAdmin={p.is_admin} className="mt-2 !text-xs" />
          <div className="mt-4">{relationAction}</div>
          {p.is_muted && isFriend && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><BellOff className="size-3.5" /> Уведомления от друга отключены</p>
          )}
        </Card>

        {p.is_admin ? (
          <Card>
            <p className="text-center text-sm text-text-2">
              Администратор помогает с доступом к аккаунту. В друзья его добавить нельзя. Если не получается войти — оставь заявку на странице входа.
            </p>
          </Card>
        ) : p.access === "none" ? (
          <Card>
            <EmptyState icon={<Lock />} title="Закрытый профиль" text="Настроение видят только друзья. Отправь заявку, чтобы видеть его." />
          </Card>
        ) : !latest ? (
          <Card>
            <EmptyState icon={<Eye />} title="Пока нет отметок" text={`${p.display_name} ещё не отмечал(а) настроение`} />
          </Card>
        ) : !showMood ? (
          /* Настроение открывается только по желанию */
          <button
            onClick={() => setShowMood(true)}
            className="flex w-full items-center gap-4 rounded-[24px] p-5 text-left transition active:scale-[0.99]"
            style={{ background: lm!.soft }}
          >
            <span className="flex size-16 shrink-0 items-center justify-center rounded-[20px] bg-surface shadow-card">
              <MoodEmoji value={lm!.value} size={46} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text-2">
                {formatRelativeDay(latest.entry_date)}, {formatTime(latest.mood_time)}
              </span>
              <span className="block text-[22px] font-extrabold" style={{ color: lm!.color }}>{lm!.label}</span>
            </span>
            <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-surface px-4 text-sm font-semibold shadow-card">
              <Eye className="size-4" /> Смотреть
            </span>
          </button>
        ) : (
          <section>
            <h2 className="mb-3 text-[19px] font-bold tracking-tight">
              {p.access === "latest" ? "Последняя отметка" : "Последние отметки"}
            </h2>
            {entriesQ.loading ? (
              <Skeleton className="h-48" />
            ) : entriesQ.error ? (
              <ErrorState text={humanError(entriesQ.error)} onRetry={entriesQ.refetch} />
            ) : (
              <EntryCarousel entries={entries.slice(0, 20)} />
            )}
          </section>
        )}

        {!p.is_admin && <SupportWallCard userId={p.id} ownerName={p.display_name} />}

        {!p.is_admin && p.can_see_history && latest && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={() => setPanel("calendar")}>
              <CalendarDays className="size-5" /> Календарь
            </Button>
            <Button variant="outline" size="lg" onClick={() => setPanel("stats")}>
              <BarChart3 className="size-5" /> Статистика
            </Button>
          </div>
        )}
        {!p.is_admin && notes.length > 0 && (
          <Button variant="outline" size="lg" onClick={() => setPanel("notes")}>
            <NotebookPen className="size-5" /> Заметки ({notes.length})
          </Button>
        )}
        {!p.is_admin && days.length > 0 && (
          <Button variant="outline" size="lg" onClick={() => setPanel("days")}>
            <Sunrise className="size-5" /> Итоги дней ({days.length})
          </Button>
        )}
        {p.access === "latest" && (
          <p className="flex items-center gap-2 px-1 text-[13px] text-muted">
            <Lock className="size-4" /> Календарь и статистику {p.display_name} показывает только друзьям
          </p>
        )}
      </div>

      {/* Календарь: по нажатию на день — его отметки ниже */}
      <Sheet open={panel === "calendar"} onClose={() => { setPanel(null); setDay(null); }} title="Календарь" wide>
        {entriesQ.loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <>
            <MonthCalendar year={ym.y} month={ym.m} onChange={(y, m) => setYm({ y, m })} byDate={dayAgg} onDayClick={setDay} />
            {day && (
              <div className="mt-5">
                <p className="mb-2 text-[15px] font-bold">{capitalize(formatLong(fromKey(day)))}</p>
                {(byDate.get(day) ?? []).length ? (
                  <div className="flex flex-col gap-2">
                    {(byDate.get(day) ?? []).map((e) => (
                      <div key={e.id} className="rounded-[22px] bg-surface-2 p-1"><EntryCard entry={e} highlight /></div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">В этот день отметок нет</p>
                )}
              </div>
            )}
          </>
        )}
      </Sheet>

      <Sheet open={panel === "days"} onClose={() => setPanel(null)} title={`Итоги дней: ${p.display_name}`} wide>
        <ReflectionSummary list={days} />
      </Sheet>

      <Sheet open={panel === "notes"} onClose={() => setPanel(null)} title={`Заметки: ${p.display_name}`} wide>
        <JournalReadList notes={notes} groups={groupsQ.data ?? []} />
      </Sheet>

      <Sheet open={panel === "stats"} onClose={() => setPanel(null)} title={`Статистика: ${p.display_name}`} wide>
        {entriesQ.loading ? <div className="flex justify-center py-10"><Spinner /></div> : <StatsView entries={entries} showInsights={false} />}
      </Sheet>

      <Sheet
        open={friendMenu}
        onClose={() => { setFriendMenu(false); setConfirmRemove(false); }}
        title={`${p.display_name} в друзьях`}
      >
        <p className="mb-4 text-text-2">
          {p.display_name} видит всё твоё настроение, заметки и фото, а ты — его.
        </p>
        <div className="flex flex-col gap-2 pb-2">
          {confirmRemove ? (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" size="lg" onClick={() => setConfirmRemove(false)} disabled={busy}>
                Отмена
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                size="lg"
                loading={busy}
                onClick={async () => {
                  await act(() => removeFriendship(p.friendship_id!), "Удалён из друзей");
                  setFriendMenu(false);
                }}
              >
                Точно удалить?
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="flex h-14 items-center gap-3 rounded-2xl bg-danger-soft px-4 text-left font-semibold text-danger"
            >
              <UserMinus className="size-5" /> Удалить из друзей
            </button>
          )}
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
