"use client";
import { useRouter } from "next/navigation";
import { CheckCheck, Settings, Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { PushBanner } from "@/components/notifications/PushControl";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, invalidate } from "@/lib/query";
import { fetchNotifications, fetchNotifSettings, markRead, keys } from "@/lib/api";
import { moodOf } from "@/lib/mood";
import { timeAgo, todayKey, toKey } from "@/lib/dates";
import { humanError } from "@/lib/errors";
import type { NotificationRow } from "@/lib/types";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

/** Текст уведомления (без заметок и фото) */
function notificationText(n: NotificationRow): { text: React.ReactNode; mood?: number } {
  const name = <b>{n.actor?.display_name ?? "Пользователь"}</b>;
  const m = n.data?.mood_value ? moodOf(n.data.mood_value) : null;
  switch (n.type) {
    case "friend_request":
      return { text: <>{name} хочет добавить тебя в друзья</> };
    case "request_accepted":
      return { text: <>{name} принял(а) твою заявку в друзья</> };
    case "support_message":
      return { text: <>{name} оставил(а) тебе сообщение в окне поддержки</> };
    case "request_declined":
      return { text: <>{name} отклонил(а) твою заявку в друзья</> };
    case "new_friend":
      return { text: <>{name} теперь в списке твоих друзей</> };
    case "friend_mood":
      return {
        text: m && m.value <= 2 ? <>{name} сегодня чувствует себя {m.feel}</> : <>{name} отметил(а) настроение: <b>{m?.label}</b></>,
        mood: m?.value,
      };
    case "friend_mood_updated":
      return { text: <>{name} обновил(а) своё настроение{m ? <>: <b>{m.label}</b></> : null}</>, mood: m?.value };
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const q = useQuery(keys.notifications, fetchNotifications);
  const settings = useQuery(keys.notifSettings, fetchNotifSettings);
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.is_read).length;
  const hiddenInApp = settings.data && !settings.data.inapp_enabled;

  async function open(n: NotificationRow) {
    if (!n.is_read) {
      markRead([n.id]).then(() => invalidate(keys.unread, keys.notifications)).catch(() => undefined);
    }
    if (n.type === "friend_request") router.push("/friends/");
    else if (n.type === "support_message") router.push("/support/");
    else if (n.actor) router.push(`/user/?u=${n.actor.username}`);
  }

  async function readAll() {
    try {
      await markRead("all");
      invalidate(keys.unread, keys.notifications);
    } catch (e) {
      toast(humanError(e), "error");
    }
  }

  const today = todayKey();
  const groups = [
    { title: "Сегодня", items: items.filter((n) => toKey(new Date(n.created_at)) === today) },
    { title: "Раньше", items: items.filter((n) => toKey(new Date(n.created_at)) !== today) },
  ].filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        eyebrow={unread ? `${unread} непрочитанных` : "Всё прочитано"}
        title="Уведомления"
        bell={false}
        actions={
          <>
            {unread > 0 && (
              <button onClick={readAll} aria-label="Отметить все прочитанными" className="flex size-11 items-center justify-center rounded-full bg-surface shadow-card">
                <CheckCheck className="size-5" />
              </button>
            )}
            <Link href="/settings/notifications/" aria-label="Настройки уведомлений" className="flex size-11 items-center justify-center rounded-full bg-surface shadow-card">
              <Settings className="size-5" />
            </Link>
          </>
        }
      />
      <div className="lg:max-w-2xl">
        <PushBanner />
        {q.loading ? (
          <div className="flex flex-col gap-2"><Skeleton className="h-[72px]" /><Skeleton className="h-[72px]" /></div>
        ) : q.error ? (
          <ErrorState text={humanError(q.error)} onRetry={q.refetch} />
        ) : hiddenInApp ? (
          <EmptyState icon={<BellOff />} title="Внутренние уведомления выключены" text="Их можно включить в настройках уведомлений" />
        ) : !items.length ? (
          <EmptyState icon={<Bell />} title="Пока нет уведомлений" text="Здесь появятся заявки в друзья и обновления настроения друзей" />
        ) : (
          groups.map((g) => (
            <section key={g.title} className="mb-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">{g.title}</h2>
              <ul className="flex flex-col gap-2">
                {g.items.map((n) => {
                  const { text, mood } = notificationText(n);
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => open(n)}
                        className={`flex w-full items-center gap-3 rounded-[20px] p-3 text-left shadow-card transition active:scale-[0.99] ${n.is_read ? "bg-surface" : "bg-accent-soft"}`}
                      >
                        <span className="relative">
                          <Avatar src={n.actor?.avatar_url} name={n.actor?.display_name ?? "?"} size={48} />
                          {mood && (
                            <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-surface text-sm">
                              <MoodEmoji value={mood} size={20} />
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] leading-snug">{text}</span>
                          <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.created_at)}</span>
                        </span>
                        {!n.is_read && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label="Не прочитано" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
