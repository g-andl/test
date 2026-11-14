"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Send, Trash2, Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, invalidate } from "@/lib/query";
import { fetchSupportWall, postSupportMessage, deleteSupportMessage, keys } from "@/lib/api";
import { timeAgo } from "@/lib/dates";
import { humanError } from "@/lib/errors";
import type { SupportMessage } from "@/lib/types";

/** Одно сообщение; удаление в два касания (автору, владельцу окна и администратору) */
export function MessageRow({ m, onDeleted }: { m: SupportMessage; onDeleted: () => void }) {
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

  return (
    <li className="flex gap-3 rounded-[20px] bg-surface-2 p-3">
      <Link href={`/user/?u=${m.author_username}`} aria-label={m.author_display_name} className="shrink-0">
        <Avatar src={m.author_avatar_url} name={m.author_display_name} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-sm">
          <Link href={`/user/?u=${m.author_username}`} className="truncate font-bold">{m.author_display_name}</Link>
          <StatusBadge userId={m.author_id} />
          <span className="shrink-0 text-xs text-muted">{timeAgo(m.created_at)}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug text-text-2">{m.body}</p>
      </div>
      {m.can_delete &&
        (confirm ? (
          <button
            onClick={remove}
            disabled={busy}
            className="h-10 shrink-0 self-start rounded-full bg-danger px-3 text-xs font-semibold text-white transition active:scale-95"
          >
            Удалить?
          </button>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            aria-label="Удалить сообщение"
            title="Удалить"
            className="flex size-10 shrink-0 items-center justify-center self-start rounded-full text-muted transition hover:bg-danger-soft hover:text-danger active:scale-95"
          >
            <Trash2 className="size-[18px]" />
          </button>
        ))}
    </li>
  );
}

/**
 * Окно поддержки пользователя. На чужом профиле: форма «написать» (если разрешено) и сообщения (если разрешено видеть).
 * На своей странице (own): все полученные сообщения, любое можно удалить.
 */
export function SupportWallCard({ userId, ownerName, own }: { userId: string; ownerName: string; own?: boolean }) {
  const toast = useToast();
  const wall = useQuery(keys.support(userId), () => fetchSupportWall(userId));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const w = wall.data;

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await postSupportMessage(userId, body);
      setText("");
      toast(w?.can_view ? "Сообщение отправлено" : `Сообщение отправлено — его увидит только ${ownerName}`);
      invalidate(keys.support(userId));
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (wall.loading) return <Skeleton className="h-32" />;
  // Нельзя ни писать, ни смотреть — раздел не показываем
  if (!w || (!w.can_view && !w.can_write)) return null;

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
        <Heart className="size-5 text-danger" /> Окно поддержки
        {w.can_view && w.total > 0 && <span className="text-sm font-medium text-muted">· {w.total}</span>}
      </h2>
      <p className="mb-3 mt-0.5 text-[13px] text-muted">
        {own ? "Тёплые слова, которые тебе оставили. Любое сообщение можно удалить." : `Оставь ${ownerName} тёплое слово — это приятно.`}
      </p>

      {w.can_write && (
        <div className="mb-4">
          <label htmlFor={`support-${userId}`} className="sr-only">Сообщение</label>
          <textarea
            id={`support-${userId}`}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="Например: ты молодец, держись!"
            className="w-full resize-none rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent focus:bg-surface"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{text.length}/500</span>
            <Button size="sm" variant="accent" disabled={!text.trim()} loading={busy} onClick={send}>
              <Send className="size-4" /> Отправить
            </Button>
          </div>
          {!w.can_view && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Lock className="size-3.5" /> Сообщения видит только {ownerName}
            </p>
          )}
        </div>
      )}

      {w.can_view &&
        (w.messages.length ? (
          <ul className="flex flex-col gap-2">
            {w.messages.map((m) => (
              <MessageRow key={m.id} m={m} onDeleted={() => invalidate(keys.support(userId))} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
            {own ? "Пока никто ничего не оставил." : "Пока здесь пусто."}
          </p>
        ))}
      {!w.can_write && !own && w.can_view && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" /> {ownerName} ограничил(а), кто может писать
        </p>
      )}
    </Card>
  );
}
