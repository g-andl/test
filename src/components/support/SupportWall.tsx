"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Heart, Send, Trash2, Lock, CornerDownRight, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { useToast } from "@/components/providers/ToastProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useQuery, invalidate } from "@/lib/query";
import { fetchSupportWall, postSupportMessage, deleteSupportMessage, keys } from "@/lib/api";
import { timeAgo, plural } from "@/lib/dates";
import { humanError } from "@/lib/errors";
import type { SupportMessage } from "@/lib/types";

interface Thread {
  root: SupportMessage;
  replies: SupportMessage[];
}

/** Сообщения → ветки: новые сверху, ответы внутри ветки по порядку, как комментарии */
function buildThreads(messages: SupportMessage[]): Thread[] {
  const roots = messages.filter((m) => !m.parent_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return roots.map((root) => ({
    root,
    replies: messages.filter((m) => m.parent_id === root.id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

/** Поле ввода: для нового сообщения и для ответа */
function Composer({
  label,
  placeholder,
  initial = "",
  submitLabel,
  rows = 3,
  autoFocus,
  onSend,
  onCancel,
}: {
  /** Название поля для экранных читалок */
  label?: string;
  placeholder: string;
  initial?: string;
  submitLabel: string;
  rows?: number;
  autoFocus?: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSend(body);
      setText("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <textarea
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        rows={rows}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="w-full resize-none rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent focus:bg-surface"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-xs text-muted">{text.length}/500</span>
        <div className="ml-auto flex shrink-0 gap-2">
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
              Отмена
            </Button>
          )}
          <Button size="sm" variant="accent" className="whitespace-nowrap" disabled={!text.trim() || (initial !== "" && text.trim() === initial.trim())} loading={busy} onClick={send}>
            <Send className="size-4" /> {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Одно сообщение или ответ: автор, время, текст, «Ответить» и удаление в два касания */
function Message({ m, small, onReply, onDeleted }: { m: SupportMessage; small?: boolean; onReply?: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  async function remove() {
    setBusy(true);
    try {
      await deleteSupportMessage(m.id);
      toast("Сообщение удалено");
      onDeleted();
    } catch (e) {
      toast(humanError(e), "error");
      setBusy(false);
    }
  }

  // Если ответили на чужой ответ, начинаем текст с имени: «Мария, спасибо!»
  const addressed = m.parent_id && m.reply_to_id && m.reply_to_id !== m.parent_id ? m.reply_to_name : null;

  return (
    <div className="flex gap-3">
      <Link href={`/user/?u=${m.author_username}`} aria-label={m.author_display_name} className="shrink-0">
        <Avatar src={m.author_avatar_url} name={m.author_display_name} size={small ? 32 : 40} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <Link href={`/user/?u=${m.author_username}`} className="max-w-full truncate font-bold">{m.author_display_name}</Link>
          <StatusBadge userId={m.author_id} />
          <span className="shrink-0 text-xs text-muted">{timeAgo(m.created_at)}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug text-text-2">
          {addressed && <b className="text-text">{addressed}, </b>}
          {m.body}
        </p>
        <div className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-muted">
          {onReply && m.can_reply && (
            <button onClick={onReply} className="-ml-2 flex h-9 items-center gap-1 rounded-full px-2.5 transition hover:bg-surface-2 hover:text-text active:scale-95">
              <CornerDownRight className="size-4" /> Ответить
            </button>
          )}
          {m.can_delete &&
            (confirm ? (
              <button onClick={remove} disabled={busy} className="h-9 rounded-full bg-danger px-3 text-xs font-semibold text-white transition active:scale-95">
                Удалить?
              </button>
            ) : (
              <button
                onClick={() => setConfirm(true)}
                aria-label="Удалить сообщение"
                title="Удалить"
                className="flex h-9 items-center gap-1 rounded-full px-2.5 transition hover:bg-danger-soft hover:text-danger active:scale-95"
              >
                <Trash2 className="size-4" /> <span className="sr-only">Удалить</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Ветка: сообщение и ответы под ним, поле ответа открывается под нужным сообщением */
function ThreadView({ thread, userId, onChanged }: { thread: Thread; userId: string; onChanged: () => void }) {
  const toast = useToast();
  const [replyTo, setReplyTo] = useState<SupportMessage | null>(null);
  const { root, replies } = thread;

  async function sendReply(text: string) {
    if (!replyTo) return;
    try {
      await postSupportMessage(userId, text, replyTo.id);
      toast("Ответ отправлен");
      setReplyTo(null);
      onChanged();
    } catch (e) {
      toast(humanError(e), "error");
      throw e;
    }
  }
  const composer = (to: SupportMessage) => (
    <div className="mt-2">
      <Composer
        placeholder={`Ответ для ${to.author_display_name}`}
        // Ответ на ответ начинаем с имени, как во ВК
        initial={to.parent_id ? `${to.author_display_name}, ` : ""}
        submitLabel="Отправить"
        rows={2}
        autoFocus
        onSend={sendReply}
        onCancel={() => setReplyTo(null)}
      />
    </div>
  );

  return (
    <li className="rounded-[22px] bg-surface-2 p-3.5">
      <Message m={root} onReply={() => setReplyTo(root)} onDeleted={onChanged} />
      {replyTo?.id === root.id && <div className="sm:pl-[52px]">{composer(root)}</div>}
      {replies.length > 0 && (
        <ul className="mt-2 flex flex-col gap-3 border-l-2 border-line pl-3 sm:ml-5">
          {replies.map((r) => (
            <li key={r.id}>
              <Message m={r} small onReply={() => setReplyTo(r)} onDeleted={onChanged} />
              {replyTo?.id === r.id && <div className="sm:pl-11">{composer(r)}</div>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Окно поддержки пользователя в виде комментариев.
 * На чужом профиле: форма «написать» (если разрешено) и ветки; на своей странице (own): все сообщения,
 * на любое можно ответить, любое можно удалить.
 */
export function SupportWallCard({ userId, ownerName, own }: { userId: string; ownerName: string; own?: boolean }) {
  const toast = useToast();
  const wall = useQuery(keys.support(userId), () => fetchSupportWall(userId));
  const [shown, setShown] = useState(10);
  const w = wall.data;
  const threads = useMemo(() => buildThreads(w?.messages ?? []), [w]);
  const refresh = () => invalidate(keys.support(userId));

  async function send(text: string) {
    try {
      await postSupportMessage(userId, text);
      toast(w?.can_view ? "Сообщение отправлено" : `Сообщение отправлено — его увидит только ${ownerName}`);
      refresh();
    } catch (e) {
      toast(humanError(e), "error");
      throw e;
    }
  }

  if (wall.loading) return <Skeleton className="h-32" />;
  // Нельзя ни писать, ни смотреть, и своих сообщений нет — раздел не показываем
  if (!w || (!w.can_view && !w.can_write && !w.messages.length)) return null;

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
        <Heart className="size-5 text-danger" /> Окно поддержки
        {w.total > 0 && <span className="text-sm font-medium text-muted">· {w.total}</span>}
      </h2>
      <p className="mb-3 mt-0.5 text-[13px] text-muted">
        {own ? "Тёплые слова, которые тебе оставили. Отвечай на них и удаляй любые." : `Оставь ${ownerName} тёплое слово — это приятно.`}
      </p>

      {w.can_write && !own && (
        <div className="mb-4">
          <Composer label="Сообщение" placeholder="Например: ты молодец, держись!" submitLabel="Отправить" onSend={send} />
          {!w.can_view && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Lock className="size-3.5" /> Сообщения видит только {ownerName}; свою переписку с ним видишь и ты
            </p>
          )}
        </div>
      )}

      {threads.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2.5">
            {threads.slice(0, shown).map((t) => (
              <ThreadView key={t.root.id} thread={t} userId={userId} onChanged={refresh} />
            ))}
          </ul>
          {threads.length > shown && (
            <Button variant="secondary" block className="mt-3" onClick={() => setShown((n) => n + 10)}>
              Показать ещё ({threads.length - shown})
            </Button>
          )}
        </>
      ) : (
        // В чужом окне пустоту не подписываем: поле для сообщения и так видно
        w.can_view && own && (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Пока никто ничего не оставил.</p>
        )
      )}
      {!w.can_write && !own && (w.can_view || threads.length > 0) && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" /> {ownerName} ограничил(а), кто может писать
        </p>
      )}
    </Card>
  );
}

/** Блок на главной: несколько последних сообщений, остальное — по ссылке на полную страницу */
export function SupportPreview() {
  const { profile } = useAuth();
  const id = profile?.id;
  const wall = useQuery(id ? `${keys.support(id)}:preview` : null, () => fetchSupportWall(id!, 3));
  const threads = useMemo(() => buildThreads(wall.data?.messages ?? []), [wall.data]);
  const total = wall.data?.total ?? 0;

  if (!id) return null;
  if (wall.loading) return <Skeleton className="h-28" />;

  return (
    <section aria-label="Окно поддержки" className="rounded-[28px] bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[19px] font-bold tracking-tight">
          <Heart className="size-5 text-danger" /> Окно поддержки
          {total > 0 && <span className="text-base font-medium text-muted">· {total}</span>}
        </h2>
        {total > 0 && (
          <Link href="/support/" className="flex h-10 items-center gap-0.5 text-sm font-semibold text-accent">
            {total > threads.length ? `Все (${total})` : "Открыть"} <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
      {threads.length === 0 ? (
        <p className="text-sm text-muted">
          Здесь появятся тёплые слова от других пользователей.{" "}
          <Link href="/settings/privacy/" className="font-semibold text-accent">Настроить, кто может писать</Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {threads.map(({ root, replies }) => (
            <li key={root.id}>
              <Link href="/support/" className="flex gap-3 rounded-2xl p-2 transition hover:bg-surface-2 active:scale-[0.99]">
                <Avatar src={root.author_avatar_url} name={root.author_display_name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 text-sm">
                    <b className="truncate">{root.author_display_name}</b>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(root.created_at)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 break-words text-[15px] leading-snug text-text-2">{root.body}</span>
                  {replies.length > 0 && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-accent">
                      <CornerDownRight className="size-3.5" /> {replies.length} {plural(replies.length, ["ответ", "ответа", "ответов"])}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
