"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { KeyRound, Trash2, Save, Wand2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/States";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, invalidate } from "@/lib/query";
import {
  adminUserEntries, adminUpdateEntry, adminDeleteEntry, adminSetPassword, adminUpdateProfile, adminDeleteUser, LOGIN_DOMAIN,
} from "@/lib/api";
import { MOODS, dayPartOf } from "@/lib/mood";
import { formatRelativeDay, formatTime } from "@/lib/dates";
import { humanError } from "@/lib/errors";
import { usePhoto } from "@/hooks/data";
import type { AdminUser, MoodEntry } from "@/lib/types";

const VIS: Record<string, string> = { all: "видят всё", latest: "только последнее", none: "закрытый профиль" };

export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Случайный временный пароль: 12 символов без похожих букв */
function randomPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => abc[n % abc.length]).join("");
}

function EntryEditor({ entry, onChanged }: { entry: MoodEntry; onChanged: () => void }) {
  const toast = useToast();
  const [mood, setMood] = useState(entry.mood_value);
  const [note, setNote] = useState(entry.note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const photo = usePhoto(entry.photo_path);
  const dirty = mood !== entry.mood_value || note !== (entry.note ?? "");

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      onChanged();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-[20px] bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-[13px] text-text-2">
        <span>
          <b className="text-text">{formatRelativeDay(entry.entry_date)}</b> · {dayPartOf(entry.day_part).label.toLowerCase()}, {formatTime(entry.mood_time)}
        </span>
        <span className="text-muted">изм. {formatTime(entry.updated_at)}</span>
      </div>
      <div role="radiogroup" aria-label="Настроение" className="mb-2 flex gap-1.5">
        {MOODS.map((m) => (
          <button
            key={m.value}
            role="radio"
            aria-checked={mood === m.value}
            aria-label={m.label}
            onClick={() => setMood(m.value)}
            className="flex size-11 items-center justify-center rounded-xl border-2 transition"
            style={{ background: mood === m.value ? m.soft : "var(--surface)", borderColor: mood === m.value ? m.color : "transparent" }}
          >
            <MoodEmoji value={m.value} size={26} decorative />
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 2000))}
        rows={2}
        placeholder="Без заметки"
        aria-label="Заметка"
        className="w-full resize-y rounded-xl bg-surface px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
      />
      {photo.data && <img src={photo.data} alt="Фото к отметке" className="mt-2 max-h-48 rounded-xl object-cover" />}
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={!dirty} loading={busy && !confirm} onClick={() => run(() => adminUpdateEntry(entry.id, mood, note), "Отметка изменена")}>
          <Save className="size-4" /> Сохранить
        </Button>
        {confirm ? (
          <Button size="sm" variant="danger" loading={busy} onClick={() => run(() => adminDeleteEntry(entry), "Отметка удалена")}>
            Точно удалить?
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            <Trash2 className="size-4" /> Удалить
          </Button>
        )}
      </div>
    </li>
  );
}

/** Всё о пользователе: данные, смена пароля, редактирование, отметки, удаление */
export function AdminUserSheet({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const toast = useToast();
  const entries = useQuery(user ? `admin-entries:${user.id}` : null, () => adminUserEntries(user!.id));
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [delText, setDelText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- заполняем форму при открытии карточки */
    setName(user?.display_name ?? "");
    setUsername(user?.username ?? "");
    setPassword("");
    setDelText("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user]);

  if (!user) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const realEmail = !user.email.endsWith(`@${LOGIN_DOMAIN}`);

  async function run(key: string, fn: () => Promise<void>, ok: string, after?: () => void) {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      invalidate("admin-users");
      after?.();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const info: [string, React.ReactNode][] = [
    ["Аккаунт создан", fmtDateTime(user.created_at)],
    ["Последний вход", fmtDateTime(user.last_sign_in_at)],
    ["Вход", realEmail ? `по почте ${user.email} или имени` : "по имени пользователя"],
    ["Отметок", user.entries_count],
    ["Друзей", user.friends_count],
    ["Для не-друзей", VIS[user.public_visibility ?? ""] ?? "—"],
    ["ID", <span key="id" className="break-all font-mono text-xs">{user.id}</span>],
  ];

  return (
    <Sheet open={!!user} onClose={onClose} title="Аккаунт" wide>
      <div className="flex items-center gap-4">
        <Avatar src={user.avatar_url} name={user.display_name ?? "?"} size={64} />
        <div className="min-w-0">
          <p className="truncate text-[20px] font-extrabold">{user.display_name}</p>
          <p className="text-muted">@{user.username}</p>
          {user.is_admin && <span className="mt-1 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">Администратор</span>}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 rounded-2xl bg-surface-2 p-4 text-sm sm:grid-cols-2">
        {info.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-5">
        <h3 className="mb-2 font-bold">Профиль</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Имя" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
          <Field label="Имя пользователя" value={username} maxLength={24} autoCapitalize="none" onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} />
        </div>
        <Button
          size="sm"
          className="mt-2"
          disabled={!name.trim() || !/^[a-z0-9_]{3,24}$/.test(username) || (name === user.display_name && username === user.username)}
          loading={busy === "profile"}
          onClick={() => run("profile", () => adminUpdateProfile(user.id, name, username), "Профиль сохранён")}
        >
          <Save className="size-4" /> Сохранить профиль
        </Button>
      </section>

      <section className="mt-5">
        <h3 className="mb-1 font-bold">Новый пароль</h3>
        <p className="mb-2 text-[13px] text-muted">Старый пароль узнать нельзя — он хранится в зашифрованном виде. Задай временный и передай пользователю.</p>
        <div className="flex gap-2">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Не короче 8 символов"
            aria-label="Новый пароль"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 font-mono text-[15px] outline-none focus:ring-2 focus:ring-accent"
          />
          <Button size="sm" variant="secondary" onClick={() => setPassword(randomPassword())} aria-label="Сгенерировать пароль">
            <Wand2 className="size-4" />
          </Button>
          <Button
            size="sm"
            disabled={password.length < 8}
            loading={busy === "password"}
            onClick={() => run("password", () => adminSetPassword(user.id, password), "Пароль изменён")}
          >
            <KeyRound className="size-4" /> Задать
          </Button>
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 font-bold">Отметки {entries.data ? `(${entries.data.length})` : ""}</h3>
        {entries.loading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : !entries.data?.length ? (
          <p className="text-sm text-muted">Отметок нет</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.data.slice(0, 100).map((e) => (
              <EntryEditor key={e.id + e.updated_at} entry={e} onChanged={() => { entries.refetch(); invalidate("admin-users"); }} />
            ))}
          </ul>
        )}
        {(entries.data?.length ?? 0) > 100 && <p className="mt-2 text-xs text-muted">Показаны последние 100 отметок.</p>}
      </section>

      {!user.is_admin && (
        <section className="mt-6 rounded-2xl border border-danger/30 p-4">
          <h3 className="font-bold text-danger">Удалить аккаунт</h3>
          <p className="mt-1 text-[13px] text-muted">Удалятся профиль, отметки, фото, друзья и уведомления. Действие необратимо. Введи имя пользователя для подтверждения.</p>
          <div className="mt-2 flex gap-2">
            <input
              value={delText}
              onChange={(e) => setDelText(e.target.value.trim().toLowerCase())}
              placeholder={user.username ?? ""}
              aria-label="Имя пользователя для подтверждения"
              autoCapitalize="none"
              className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-danger"
            />
            <Button
              size="sm"
              variant="danger"
              disabled={delText !== user.username}
              loading={busy === "delete"}
              onClick={() => run("delete", () => adminDeleteUser(user.id), "Аккаунт удалён", onClose)}
            >
              <Trash2 className="size-4" /> Удалить
            </Button>
          </div>
        </section>
      )}
    </Sheet>
  );
}
