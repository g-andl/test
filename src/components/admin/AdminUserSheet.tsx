"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { ArrowUpDown, CalendarDays, KeyRound, Trash2, Save, Wand2, Plus, Mail, Shield, Clock, Ban, Heart, Pencil, Send } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { BadgePill, useBadges } from "@/components/badges/StatusBadge";
import { BadgeForm } from "@/components/badges/BadgeEditor";
import { Spinner } from "@/components/ui/States";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, invalidate } from "@/lib/query";
import {
  adminUserEntries, adminCreateEntry, adminUpdateEntry, adminSetContactEmail, adminBlockUser, adminUnblockUser, fetchSupportWall, deleteSupportMessage, adminSaveBadge, adminSetUserBadge, adminEditSupportMessage, adminPostSupportMessage, keys, adminUpdatePrivacy, adminUserPrivacy, adminUserActivity, EMAIL_RE, adminDeleteEntry, adminSetPassword, adminUpdateProfile, adminDeleteUser, amIOwner, adminSetAdmin,
} from "@/lib/api";
import { MOODS, dayPartOf, dayPartByHour } from "@/lib/mood";
import { formatRelativeDay, formatTime, todayKey, combineDateTime, plural } from "@/lib/dates";
import { humanError } from "@/lib/errors";
import { usePhoto } from "@/hooks/data";
import { useAuth } from "@/components/providers/AuthProvider";
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

/** Новая отметка за пользователя */
function NewEntryForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Добавить отметку
      </Button>
    );
  }

  async function save() {
    if (!mood) return;
    const [h, m] = time.split(":").map(Number);
    setBusy(true);
    try {
      await adminCreateEntry(userId, date, combineDateTime(date, h, m), dayPartByHour(h), mood, note);
      toast("Отметка добавлена");
      setMood(null);
      setNote("");
      setOpen(false);
      onCreated();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[20px] border-2 border-dashed border-line p-3">
      <p className="mb-2 text-sm font-bold">Новая отметка за пользователя</p>
      <div className="mb-2 flex gap-2">
        <input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} aria-label="Дата" className="h-11 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Время" className="h-11 w-28 rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent" />
      </div>
      <div role="radiogroup" aria-label="Настроение новой отметки" className="mb-2 flex gap-1.5">
        {MOODS.map((m) => (
          <button
            key={m.value}
            role="radio"
            aria-checked={mood === m.value}
            aria-label={m.label}
            onClick={() => setMood(m.value)}
            className="flex size-11 items-center justify-center rounded-xl border-2 transition"
            style={{ background: mood === m.value ? m.soft : "var(--surface-2)", borderColor: mood === m.value ? m.color : "transparent" }}
          >
            <MoodEmoji value={m.value} size={26} decorative />
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 2000))}
        rows={2}
        placeholder="Заметка (необязательно)"
        aria-label="Заметка новой отметки"
        className="w-full resize-y rounded-xl bg-surface-2 px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Отмена</Button>
        <Button size="sm" disabled={!mood || !date || !time} loading={busy} onClick={save}>
          <Save className="size-4" /> Добавить
        </Button>
      </div>
    </div>
  );
}


/** Почта для восстановления */
function ContactEmailSection({ user, onSaved }: { user: AdminUser; onSaved: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState(user.contact_email ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- подставляем почту выбранного пользователя
    setEmail(user.contact_email ?? "");
  }, [user.id, user.contact_email]);
  const valid = email.trim() === "" || EMAIL_RE.test(email.trim());
  return (
    <section className="mt-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold"><Mail className="size-4 text-muted" /> Почта для восстановления</h3>
      <p className="mb-2 text-[13px] text-muted">Пользователь указал её при регистрации. Писем на неё сервис не отправляет.</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="не указана"
          aria-label="Почта для восстановления"
          autoCapitalize="none"
          className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
        />
        <Button
          size="sm"
          disabled={!valid || email.trim().toLowerCase() === (user.contact_email ?? "")}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await adminSetContactEmail(user.id, email);
              toast("Почта сохранена");
              onSaved();
            } catch (e) {
              toast(humanError(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save className="size-4" /> Сохранить
        </Button>
      </div>
    </section>
  );
}

/** Приватность пользователя: что видят не-друзья */
function PrivacySection({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const toast = useToast();
  const q = useQuery(`admin-privacy:${userId}`, () => adminUserPrivacy(userId));
  const [busy, setBusy] = useState(false);
  const cur = q.data;

  async function save(visibility: string, photos: boolean, notes: boolean) {
    setBusy(true);
    try {
      await adminUpdatePrivacy(userId, visibility, photos, notes);
      toast("Приватность изменена");
      await q.refetch();
      onSaved();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold"><Shield className="size-4 text-muted" /> Приватность</h3>
      <p className="mb-2 text-[13px] text-muted">Что видят пользователи, не состоящие в друзьях. Друзья видят всё.</p>
      {!cur ? (
        <div className="flex justify-center py-3"><Spinner /></div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Что видят не-друзья" className="flex flex-wrap gap-2">
            {([["all", "Видят всё"], ["latest", "Только последнее"], ["none", "Закрытый профиль"]] as const).map(([v, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={cur.public_visibility === v}
                disabled={busy}
                onClick={() => save(v, cur.photos_public, cur.notes_public)}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${cur.public_visibility === v ? "bg-accent text-white" : "bg-surface-2 text-text-2"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              checked={cur.notes_public}
              disabled={busy || cur.public_visibility === "none"}
              onChange={(e) => save(cur.public_visibility, cur.photos_public, e.target.checked)}
              className="size-5 accent-[var(--accent)]"
            />
            Показывать заметки не-друзьям
          </label>
          <label className="mt-2 flex cursor-pointer items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              checked={cur.photos_public}
              disabled={busy || cur.public_visibility === "none"}
              onChange={(e) => save(cur.public_visibility, e.target.checked, cur.notes_public)}
              className="size-5 accent-[var(--accent)]"
            />
            Показывать фото не-друзьям
          </label>
        </>
      )}
    </section>
  );
}

const two = (n: number) => String(n).padStart(2, "0");
const logDate = (iso: string) => { const d = new Date(iso); return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`; };
const logTime = (iso: string) => { const d = new Date(iso); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
const totalDuration = (list: { started_at: string; last_seen_at: string }[]) => {
  const min = Math.round(list.reduce((sum, x) => sum + (new Date(x.last_seen_at).getTime() - new Date(x.started_at).getTime()), 0) / 60000);
  return min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60} мин`;
};
const shortDuration = (a: string, b: string) => {
  const min = Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
  return min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60} мин`;
};

/** Активность: когда пользователь заходил в приложение; поиск по датам */
function ActivitySection({ userId }: { userId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Границы по часовому поясу администратора
  const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
  const toIso = to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString() : undefined;
  const q = useQuery(`admin-activity:${userId}:${from}:${to}`, () => adminUserActivity(userId, fromIso, toIso));
  const sessions = q.data ?? [];
  const shown = sessions.slice(0, 50);
  return (
    <section className="mt-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold"><Clock className="size-4 text-muted" /> Активность {q.data ? `(${sessions.length})` : ""}</h3>
      <p className="mb-2 text-[13px] text-muted">Когда пользователь открывал приложение. Перерыв больше 30 минут — новый заход.</p>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-muted">
          с
          <input type="date" value={from} max={to || todayKey()} onChange={(e) => setFrom(e.target.value)} aria-label="Активность с даты" className="h-10 rounded-xl bg-surface-2 px-2 text-[15px] text-text outline-none focus:ring-2 focus:ring-accent" />
        </label>
        <label className="flex items-center gap-1.5 text-muted">
          по
          <input type="date" value={to} min={from || undefined} max={todayKey()} onChange={(e) => setTo(e.target.value)} aria-label="Активность по дату" className="h-10 rounded-xl bg-surface-2 px-2 text-[15px] text-text outline-none focus:ring-2 focus:ring-accent" />
        </label>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="h-10 px-2 text-sm font-semibold text-accent">Сбросить</button>
        )}
      </div>
      {/* Журнал в виде консоли: тёмный фон, моноширинный шрифт, по строке на заход */}
      <div className="overflow-hidden rounded-2xl bg-[#0d1321] font-mono text-[12.5px] leading-relaxed text-[#c9d4e5] shadow-card">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-2 text-[11px] text-white/50">activity.log</span>
          {q.data && <span className="ml-auto text-[11px] text-white/50">{sessions.length} {plural(sessions.length, ["заход", "захода", "заходов"])} · {totalDuration(sessions)}</span>}
        </div>
        <div className="max-h-72 overflow-y-auto px-3 py-2">
          {q.loading ? (
            <p className="text-white/50">загрузка…</p>
          ) : !shown.length ? (
            <p className="text-white/50">{from || to ? "за выбранные даты заходов нет" : "заходов пока нет"}</p>
          ) : (
            <ul>
              {shown.map((x) => (
                <li key={x.id} className="flex gap-2 whitespace-nowrap">
                  <span className="text-[#7c8aa5]">{logDate(x.started_at)}</span>
                  <span className="text-[#5ee58f]">{logTime(x.started_at)}</span>
                  <span className="text-white/40">→</span>
                  <span>{logTime(x.last_seen_at)}</span>
                  <span className="ml-auto text-[#f5c26b]">{shortDuration(x.started_at, x.last_seen_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {sessions.length > 50 && <p className="mt-1 text-xs text-muted">Показаны последние 50 заходов — сузь даты поиска.</p>}
    </section>
  );
}


const BLOCK_PRESETS = [
  { id: "1d", label: "1 день", days: 1 },
  { id: "7d", label: "7 дней", days: 7 },
  { id: "30d", label: "30 дней", days: 30 },
  { id: "date", label: "До даты", days: 0 },
  { id: "forever", label: "Навсегда", days: -1 },
] as const;

/** Блокировка: на срок или навсегда. Заблокированный входит, но видит только экран блокировки. */
/** Назначить или снять администратора. Видна только владельцу сервиса; база это проверяет ещё раз. */
function AdminRightsSection({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const toast = useToast();
  const { profile } = useAuth();
  const owner = useQuery(profile ? `am-owner:${profile.id}` : null, amIOwner);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  if (!owner.data || user.id === profile?.id) return null;
  const make = !user.is_admin;

  async function click() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await adminSetAdmin(user.id, make);
      toast(make ? "Назначен администратором" : "Права администратора сняты");
      setConfirm(false);
      onChanged();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5">
      <h3 className="mb-1 font-bold">Права администратора</h3>
      <p className="mb-2 text-[13px] text-muted">
        {make
          ? "Получит доступ к админ-панели: аккаунты, заявки, блокировки, статусы. Остальное в его аккаунте не изменится."
          : "Админ-панель у него пропадёт, аккаунт останется обычным."}
      </p>
      <Button size="sm" variant={make ? "secondary" : "danger"} loading={busy} onClick={click}>
        <Shield className="size-4" /> {confirm ? (make ? "Точно назначить?" : "Точно снять?") : make ? "Назначить администратором" : "Снять права администратора"}
      </Button>
    </section>
  );
}

function BlockSection({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const toast = useToast();
  const [preset, setPreset] = useState<(typeof BLOCK_PRESETS)[number]["id"]>("7d");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  // Конец блокировки считаем в момент нажатия: через N дней или в конце выбранной даты (включительно)
  function computeUntil(): string | null {
    const p = BLOCK_PRESETS.find((x) => x.id === preset)!;
    if (p.days === -1) return null;
    if (p.days > 0) return new Date(Date.now() + p.days * 86400000).toISOString();
    return new Date(new Date(`${date}T00:00:00`).getTime() + 86400000).toISOString();
  }
  const ready = preset !== "date" || date !== "";

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setConfirm(false);
      onChanged();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (user.is_blocked) {
    return (
      <section className="mt-5 rounded-2xl border border-danger/40 bg-danger-soft/40 p-4">
        <h3 className="mb-1 flex items-center gap-2 font-bold text-danger"><Ban className="size-4" /> Аккаунт заблокирован</h3>
        <p className="text-sm">
          {user.blocked_until ? <>До <b>{fmtDateTime(user.blocked_until)}</b></> : <b>Навсегда</b>}
          {user.block_reason ? <> · причина: {user.block_reason}</> : null}
        </p>
        <p className="mt-1 text-[13px] text-muted">Пользователь может войти, но видит только экран блокировки.</p>
        <Button size="sm" className="mt-3" loading={busy} onClick={() => run(() => adminUnblockUser(user.id), "Аккаунт разблокирован")}>
          Разблокировать
        </Button>
      </section>
    );
  }

  return (
    <section className="mt-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold"><Ban className="size-4 text-muted" /> Блокировка</h3>
      <p className="mb-2 text-[13px] text-muted">Пользователь сможет войти, но сразу увидит, что аккаунт заблокирован.</p>
      <div role="radiogroup" aria-label="Срок блокировки" className="flex flex-wrap gap-2">
        {BLOCK_PRESETS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={preset === p.id}
            onClick={() => { setPreset(p.id); setConfirm(false); }}
            className={`h-10 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${preset === p.id ? "bg-ink text-ink-fg" : "bg-surface-2 text-text-2"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "date" && (
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          включительно по
          <input
            type="date"
            value={date}
            min={todayKey()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Блокировать по дату"
            className="h-10 rounded-xl bg-surface-2 px-2 text-[15px] text-text outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      )}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        placeholder="Причина (её увидит пользователь)"
        aria-label="Причина блокировки"
        className="mt-2 h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
      />
      <div className="mt-2 flex gap-2">
        {confirm ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Отмена</Button>
            <Button size="sm" variant="danger" loading={busy} onClick={() => run(() => adminBlockUser(user.id, computeUntil(), reason), "Аккаунт заблокирован")}>
              <Ban className="size-4" /> Точно заблокировать?
            </Button>
          </>
        ) : (
          <Button size="sm" variant="danger" disabled={!ready} onClick={() => setConfirm(true)}>
            <Ban className="size-4" /> Заблокировать
          </Button>
        )}
      </div>
    </section>
  );
}


/** Окно поддержки пользователя: админ видит всё, правит, удаляет и добавляет сообщения от имени любого пользователя */
function SupportSection({ user }: { user: AdminUser }) {
  const toast = useToast();
  const wall = useQuery(keys.support(user.id), () => fetchSupportWall(user.id));
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const messages = wall.data?.messages ?? [];

  async function run(key: string, fn: () => Promise<void>, ok: string, after?: () => void) {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      after?.();
      invalidate(keys.support(user.id));
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold"><Heart className="size-4 text-muted" /> Окно поддержки {wall.data ? `(${wall.data.total})` : ""}</h3>
      <p className="mb-2 text-[13px] text-muted">Сообщения, которые оставили этому пользователю. Можно править, удалять и добавлять от имени другого пользователя.</p>

      {wall.loading ? (
        <div className="flex justify-center py-3"><Spinner /></div>
      ) : !messages.length ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Сообщений нет</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((m) => (
            <li key={m.id} className="rounded-[18px] bg-surface-2 p-3">
              <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <b className="text-sm text-text">{m.author_display_name}</b> @{m.author_username} · {fmtDateTime(m.created_at)}
                {m.parent_id && <span className="rounded-full bg-surface px-2 py-0.5 font-bold text-muted">ответ</span>}
                {m.admin_created && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-bold text-accent">создано админом</span>}
                {m.admin_edited && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-bold text-accent">правлено админом</span>}
              </p>
              {editId === m.id ? (
                <>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value.slice(0, 500))}
                    rows={3}
                    aria-label="Текст сообщения"
                    className="w-full resize-y rounded-xl bg-surface px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)} disabled={busy === m.id}>Отмена</Button>
                    <Button
                      size="sm"
                      disabled={!editText.trim() || editText.trim() === m.body}
                      loading={busy === m.id}
                      onClick={() => run(m.id, () => adminEditSupportMessage(m.id, editText), "Сообщение изменено", () => setEditId(null))}
                    >
                      <Save className="size-4" /> Сохранить
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-line break-words text-[15px] text-text-2">{m.body}</p>
                  <div className="mt-1.5 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditId(m.id); setEditText(m.body); }}>
                      <Pencil className="size-4" /> Изменить
                    </Button>
                    {delId === m.id ? (
                      <Button size="sm" variant="danger" loading={busy === m.id} onClick={() => run(m.id, () => deleteSupportMessage(m.id), "Сообщение удалено", () => setDelId(null))}>
                        Точно удалить?
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" aria-label="Удалить сообщение" onClick={() => setDelId(m.id)}>
                        <Trash2 className="size-4" /> Удалить
                      </Button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-[20px] border-2 border-dashed border-line p-3">
        <p className="mb-2 text-sm font-bold">Добавить сообщение от имени пользователя</p>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value.toLowerCase().replace(/\s/g, ""))}
          placeholder="Имя пользователя автора, например masha_k"
          aria-label="Автор сообщения"
          autoCapitalize="none"
          className="mb-2 h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          rows={2}
          placeholder="Текст сообщения"
          aria-label="Текст нового сообщения"
          className="w-full resize-y rounded-xl bg-surface-2 px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{text.length}/500</span>
          <Button
            size="sm"
            disabled={!author.trim() || !text.trim()}
            loading={busy === "new"}
            onClick={() => run("new", () => adminPostSupportMessage(user.id, author, text), "Сообщение добавлено", () => setText(""))}
          >
            <Send className="size-4" /> Добавить
          </Button>
        </div>
      </div>
    </section>
  );
}


/** Статус пользователя: выбрать из готовых, снять или придумать новый со своим цветом */
function StatusSection({ user }: { user: AdminUser }) {
  const toast = useToast();
  const badges = useBadges();
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const current = badges.data?.byUser[user.id] ?? null;

  async function assign(key: string, fn: () => Promise<unknown>, ok: string, after?: () => void) {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      invalidate("badges");
      after?.();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5">
      <h3 className="mb-1 font-bold">Статус {current && <BadgePill name={current.name} color={current.color} hint={current.hint} className="ml-1 align-middle" />}</h3>
      <p className="mb-2 text-[13px] text-muted">
        Цветная пометка рядом с именем, её видят все.{" "}
        {current ? (badges.data?.manual[user.id] ? "Выдан вручную: система его не меняет." : "Выдан системой по активности.") : "Пока ничего не подошло по активности."}
      </p>
      {badges.loading ? (
        <div className="flex justify-center py-3"><Spinner /></div>
      ) : (
        <div role="radiogroup" aria-label="Статус пользователя" className="flex flex-wrap items-center gap-2">
          <button
            role="radio"
            aria-checked={!badges.data?.manual[user.id]}
            disabled={busy !== null}
            onClick={() => assign("none", () => adminSetUserBadge(user.id, null), "Статус снова выдаёт система")}
            className={`h-9 rounded-full px-3 text-sm font-semibold transition active:scale-95 ${!badges.data?.manual[user.id] ? "bg-ink text-ink-fg" : "bg-surface-2 text-text-2"}`}
          >
            Авто (по активности)
          </button>
          {badges.data?.list.map((b) => (
            <button
              key={b.id}
              role="radio"
              aria-checked={current?.id === b.id && !!badges.data?.manual[user.id]}
              aria-label={b.name}
              disabled={busy !== null}
              onClick={() => assign(b.id, () => adminSetUserBadge(user.id, b.id), `Статус «${b.name}» выдан`)}
              className={`rounded-full p-0.5 transition active:scale-95 ${current?.id === b.id && badges.data?.manual[user.id] ? "ring-2 ring-text" : "ring-1 ring-transparent"}`}
            >
              <BadgePill name={b.name} color={b.color} hint={b.hint} className="!px-3 !py-1.5 !text-[13px]" />
            </button>
          ))}
          <button
            onClick={() => setCreating((v) => !v)}
            className="h-9 rounded-full border-2 border-dashed border-line px-3 text-sm font-semibold text-text-2"
          >
            + Свой статус
          </button>
        </div>
      )}
      {creating && (
        <div className="mt-3 rounded-[20px] bg-surface-2 p-3">
          <p className="mb-2 text-sm font-bold">Новый статус для {user.display_name}</p>
          <BadgeForm
            submitLabel="Создать и выдать"
            busy={busy === "create"}
            onSubmit={(name, color) =>
              assign(
                "create",
                async () => {
                  const id = await adminSaveBadge(null, name, color);
                  await adminSetUserBadge(user.id, id);
                },
                "Статус создан и выдан",
                () => setCreating(false),
              )
            }
          />
        </div>
      )}
    </section>
  );
}

/** Всё о пользователе: данные, смена пароля, редактирование, отметки, удаление */
/** Отметки пользователя: раскрываются кнопкой, группируются по дням, фильтруются по датам */
function EntriesPanel({ entries, loading, onChanged }: { entries: MoodEntry[]; loading: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [limit, setLimit] = useState(30);

  if (loading) return <div className="flex justify-center py-6"><Spinner /></div>;
  if (!entries.length) return <p className="text-sm text-muted">Отметок нет</p>;
  if (!open) {
    return (
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        <CalendarDays className="size-4" /> Открыть все отметки ({entries.length})
      </Button>
    );
  }

  const filtered = entries
    .filter((e) => (!from || e.entry_date >= from) && (!to || e.entry_date <= to))
    .sort((a, b) => (newestFirst ? 1 : -1) * (b.entry_date.localeCompare(a.entry_date) || b.mood_time.localeCompare(a.mood_time)));
  const shown = filtered.slice(0, limit);
  const days: { date: string; items: MoodEntry[] }[] = [];
  for (const e of shown) {
    const last = days[days.length - 1];
    if (last && last.date === e.entry_date) last.items.push(e);
    else days.push({ date: e.entry_date, items: [e] });
  }
  const dateCls = "h-10 rounded-xl bg-surface-2 px-2 text-[15px] text-text outline-none focus:ring-2 focus:ring-accent";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-muted">
          с
          <input type="date" value={from} max={to || todayKey()} onChange={(e) => { setFrom(e.target.value); setLimit(30); }} aria-label="Отметки с даты" className={dateCls} />
        </label>
        <label className="flex items-center gap-1.5 text-muted">
          по
          <input type="date" value={to} min={from || undefined} max={todayKey()} onChange={(e) => { setTo(e.target.value); setLimit(30); }} aria-label="Отметки по дату" className={dateCls} />
        </label>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="h-10 px-2 text-sm font-semibold text-accent">Сбросить</button>
        )}
        <button onClick={() => setNewestFirst((v) => !v)} className="ml-auto flex h-10 items-center gap-1 rounded-xl bg-surface-2 px-3 text-sm font-semibold">
          <ArrowUpDown className="size-4" /> {newestFirst ? "Сначала новые" : "Сначала старые"}
        </button>
      </div>
      {!filtered.length ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">За выбранные даты отметок нет</p>
      ) : (
        days.map((d) => (
          <div key={d.date} className="mb-3">
            <p className="mb-1.5 text-xs font-bold text-muted">
              {new Date(`${d.date}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "short" })} · {d.items.length}
            </p>
            <ul className="flex flex-col gap-2">
              {d.items.map((e) => (
                <EntryEditor key={e.id + e.updated_at} entry={e} onChanged={onChanged} />
              ))}
            </ul>
          </div>
        ))
      )}
      {filtered.length > limit && (
        <Button variant="secondary" block onClick={() => setLimit((n) => n + 30)}>
          Показать ещё ({filtered.length - limit})
        </Button>
      )}
      <button onClick={() => setOpen(false)} className="mt-2 flex h-10 w-full items-center justify-center text-sm font-semibold text-accent">Свернуть</button>
    </div>
  );
}

export function AdminUserSheet({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const toast = useToast();
  const entries = useQuery(user ? `admin-entries:${user.id}` : null, () => adminUserEntries(user!.id));
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- заполняем форму при открытии карточки */
    setName(user?.display_name ?? "");
    setUsername(user?.username ?? "");
    setPassword("");
    setConfirmDel(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user]);

  if (!user) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

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
    ["Вход", "по имени пользователя или почте"],
    ["Почта для восстановления", user.contact_email ?? "не указана"],
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

      <AdminRightsSection user={user} onChanged={() => invalidate("admin-users")} />
      {!user.is_admin && <BlockSection key={user.id + String(user.is_blocked)} user={user} onChanged={() => invalidate("admin-users")} />}
      <StatusSection user={user} />
      <ContactEmailSection user={user} onSaved={() => invalidate("admin-users")} />
      <PrivacySection userId={user.id} onSaved={() => invalidate("admin-users")} />
      <ActivitySection userId={user.id} />
      <SupportSection user={user} />

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
        <div className="mb-3">
          <NewEntryForm userId={user.id} onCreated={() => { entries.refetch(); invalidate("admin-users"); }} />
        </div>
        <EntriesPanel
          key={user.id}
          entries={entries.data ?? []}
          loading={entries.loading}
          onChanged={() => { entries.refetch(); invalidate("admin-users"); }}
        />
      </section>

      {!user.is_admin && (
        <section className="mt-6 rounded-2xl border border-danger/30 p-4">
          <h3 className="font-bold text-danger">Удалить аккаунт</h3>
          <p className="mt-1 text-[13px] text-muted">Удалятся профиль, отметки, фото, друзья и уведомления. Действие необратимо.</p>
          <div className="mt-3 flex gap-2">
            {confirmDel ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setConfirmDel(false)} disabled={busy === "delete"}>
                  Отмена
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy === "delete"}
                  onClick={() => run("delete", () => adminDeleteUser(user.id), "Аккаунт удалён", onClose)}
                >
                  <Trash2 className="size-4" /> Точно удалить?
                </Button>
              </>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}>
                <Trash2 className="size-4" /> Удалить аккаунт
              </Button>
            )}
          </div>
        </section>
      )}
    </Sheet>
  );
}
