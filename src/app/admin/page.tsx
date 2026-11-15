"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowLeft, LogOut, ShieldCheck, ExternalLink, UserRound, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { Field } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge, BadgePill, useBadges } from "@/components/badges/StatusBadge";
import { BadgeForm } from "@/components/badges/BadgeEditor";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/States";
import { AdminUserSheet, fmtDateTime } from "@/components/admin/AdminUserSheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, invalidate } from "@/lib/query";
import { amIAdmin, adminListUsers, adminListRecovery, adminUpdateRecovery, adminDeleteRecovery, adminSaveBadge, adminDeleteBadge, adminRefreshBadges } from "@/lib/api";
import { humanError } from "@/lib/errors";
import { plural } from "@/lib/dates";
import type { AdminUser, RecoveryRequest } from "@/lib/types";

const STATUS: Record<RecoveryRequest["status"], { label: string; cls: string }> = {
  new: { label: "Новая", cls: "bg-danger-soft text-danger" },
  in_progress: { label: "В работе", cls: "bg-accent-soft text-accent" },
  done: { label: "Решена", cls: "bg-surface-3 text-muted" },
};

/** Ссылка на контакт: Telegram (@ник или t.me) или VK */
function contactHref(c: string): string | null {
  const v = c.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(t\.me|vk\.com|vk\.ru)\//i.test(v)) return `https://${v}`;
  if (/^@[a-z0-9_]{4,}$/i.test(v)) return `https://t.me/${v.slice(1)}`;
  return null;
}

function RecoveryCard({ r, onOpenUser }: { r: RecoveryRequest; onOpenUser: (username: string) => void }) {
  const toast = useToast();
  const [note, setNote] = useState(r.admin_note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const href = contactHref(r.contact);

  // Подтверждение удаления само сбрасывается через 3 секунды
  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDel]);

  async function remove() {
    setBusy(true);
    try {
      await adminDeleteRecovery(r.id);
      invalidate("admin-recovery");
      toast("Заявка удалена");
    } catch (e) {
      toast(humanError(e), "error");
      setBusy(false);
    }
  }

  async function set(status: RecoveryRequest["status"]) {
    setBusy(true);
    try {
      await adminUpdateRecovery(r.id, status, note);
      invalidate("admin-recovery");
      toast(status === "done" ? "Заявка закрыта" : "Сохранено");
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-[22px] bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
        <span className="text-xs text-muted">{fmtDateTime(r.created_at)}</span>
      </div>
      <p className="mt-2 text-[15px]">
        <b>{r.username.includes("@") && !r.username.startsWith("@") ? r.username : `@${r.username.replace(/^@/, "")}`}</b>{" "}
        {r.user_id ? (
          <button onClick={() => onOpenUser(r.username)} className="ml-1 inline-flex items-center gap-1 text-sm font-semibold text-accent">
            <UserRound className="size-4" /> открыть аккаунт
          </button>
        ) : (
          <span className="text-sm text-danger">аккаунт не найден</span>
        )}
      </p>
      <p className="mt-1 text-[15px]">
        Связь:{" "}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent">
            {r.contact} <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <b>{r.contact}</b>
        )}
      </p>
      <p className="mt-2 whitespace-pre-line rounded-2xl bg-surface-2 px-3 py-2 text-[15px] text-text-2">{r.message}</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 2000))}
        rows={2}
        placeholder="Заметка администратора (видишь только ты)"
        aria-label="Заметка администратора"
        className="mt-2 w-full resize-y rounded-xl bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {r.status !== "in_progress" && r.status !== "done" && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => set("in_progress")}>В работу</Button>
        )}
        {r.status !== "done" ? (
          <Button size="sm" loading={busy} onClick={() => set("done")}>Решено</Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => set("in_progress")}>Вернуть в работу</Button>
        )}
        {note !== (r.admin_note ?? "") && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => set(r.status)}>Сохранить заметку</Button>
        )}
        {confirmDel ? (
          <Button size="sm" variant="danger" loading={busy} className="ml-auto" onClick={remove}>Точно удалить?</Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} className="ml-auto" aria-label="Удалить заявку" onClick={() => setConfirmDel(true)}>
            <Trash2 className="size-4" /> Удалить
          </Button>
        )}
      </div>
    </li>
  );
}

/** Настройки администратора: смена своего пароля */
function AdminSettings() {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;
  return (
    <section className="max-w-md rounded-[22px] bg-surface p-5 shadow-card">
      <h2 className="mb-1 flex items-center gap-2 text-[17px] font-bold"><KeyRound className="size-5 text-accent" /> Сменить мой пароль</h2>
      <p className="mb-4 text-[13px] text-muted">Пароль администратора. Не короче 8 символов.</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8 || pw !== pw2) return;
          setBusy(true);
          const { error } = await supabase.auth.updateUser({ password: pw });
          setBusy(false);
          if (error) return toast(humanError(error), "error");
          toast("Пароль изменён");
          setPw("");
          setPw2("");
        }}
      >
        <input type="text" autoComplete="username" value="admin" readOnly hidden />
        <Field label="Новый пароль" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Field label="Повтори пароль" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={mismatch ? "Пароли не совпадают" : null} />
        <Button type="submit" disabled={pw.length < 8 || pw !== pw2} loading={busy}>Сохранить пароль</Button>
      </form>
    </section>
  );
}

/** Управление статусами: создать, изменить название и цвет, удалить */
function BadgesTab() {
  const toast = useToast();
  const badges = useBadges();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
      invalidate("badges");
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(null);
    }
  }
  const list = badges.data?.list ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-[22px] bg-surface p-4 shadow-card md:col-span-2">
        <h2 className="mb-1 text-[17px] font-bold">Новый статус</h2>
        <p className="mb-3 text-[13px] text-muted">Придумай название и выбери цвет. Потом выдай его пользователю в его карточке.</p>
        <BadgeForm key={list.length} submitLabel="Создать" busy={busy === "new"} onSubmit={(name, color) => run("new", () => adminSaveBadge(null, name, color), "Статус создан")} />
      </section>
      <section className="md:col-span-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold">Все статусы {list.length ? `(${list.length})` : ""}</h2>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "refresh"}
            onClick={() => run("refresh", async () => { const n = await adminRefreshBadges(); toast(`Статусы пересчитаны у ${n} пользователей`); }, "")}
          >
            <RefreshCw className="size-4" /> Пересчитать у всех
          </Button>
        </div>
        <p className="mb-1 flex items-center gap-2 text-[13px] text-muted">
          У администратора встроенная пометка <BadgePill name="Администратор" color="#4d8df7" />
        </p>
        <p className="mb-3 text-[13px] text-muted">
          Статусы с пометкой «Авто» система выдаёт сама за активность при заходе пользователя и раз в сутки. Вручную выданный статус не меняется. У автоматических можно менять название и цвет, удалять их нельзя.
        </p>
        {badges.loading ? (
          <Skeleton className="h-32" />
        ) : !list.length ? (
          <EmptyState icon={<ShieldCheck />} title="Статусов пока нет" text="Создай первый выше" />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((b) => (
              <li key={b.id + b.name + b.color} className="rounded-[22px] bg-surface p-4 shadow-card">
                {b.auto_key && (
                  <p className="mb-2 flex items-start gap-2 text-[13px] text-text-2">
                    <span className="mt-0.5 shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">Авто</span>
                    {b.hint}
                  </p>
                )}
                <BadgeForm
                  initialName={b.name}
                  initialColor={b.color}
                  submitLabel="Сохранить"
                  busy={busy === b.id}
                  holders={badges.data?.counts[b.id]}
                  onSubmit={(name, color) => run(b.id, () => adminSaveBadge(b.id, name, color), "Статус изменён")}
                  onDelete={b.auto_key ? undefined : () => run(b.id, () => adminDeleteBadge(b.id), "Статус удалён")}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminPage() {
  const { ready, session, profile, signOut } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"users" | "recovery" | "badges" | "settings">("users");
  const [reqTab, setReqTab] = useState<RecoveryRequest["status"]>("new");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [open, setOpen] = useState<AdminUser | null>(null);
  // Права определяет база: админ-панель доступна и обычному аккаунту с правами администратора
  const adminQ = useQuery(session ? `am-admin:${session.user.id}` : null, amIAdmin);
  const isAdmin = !!adminQ.data;

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (ready && !session) router.replace("/login/?next=/admin/");
  }, [ready, session, router]);

  const users = useQuery(isAdmin ? `admin-users:${search}:${limit}` : null, () => adminListUsers(search, limit));
  const recovery = useQuery(isAdmin ? "admin-recovery" : null, adminListRecovery);
  const count = (st: RecoveryRequest["status"]) => recovery.data?.filter((r) => r.status === st).length ?? 0;
  const newCount = count("new");
  const requestsShown = recovery.data?.filter((r) => r.status === reqTab) ?? [];

  // Заявки и аккаунты обновляются сами: при переходе на вкладку и каждые 20 секунд
  const refetchRecovery = recovery.refetch;
  const refetchUsers = users.refetch;
  useEffect(() => {
    if (!isAdmin) return;
    if (tab === "recovery") refetchRecovery();
    else refetchUsers();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        refetchRecovery();
        if (tab === "users") refetchUsers();
      }
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- перезапускаем только при смене вкладки
  }, [tab, isAdmin]);

  // Обновляем карточку открытого пользователя после правок
  useEffect(() => {
    if (!open || !users.data) return;
    const fresh = users.data.find((u) => u.id === open.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- синхронизация открытой карточки со списком
    if (fresh && fresh !== open) setOpen(fresh);
  }, [users.data, open]);

  async function openByUsername(username: string) {
    setTab("users");
    const list = await adminListUsers(username, 5).catch(() => []);
    const u = list.find((x) => x.username === username);
    if (u) setOpen(u);
  }

  if (!ready || (session && !profile)) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  if (session && adminQ.loading) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  if (!session || !profile) return null;
  if (!isAdmin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <EmptyState icon={<ShieldCheck />} title="Нет доступа" text="Эта страница доступна только администратору." />
        <Button onClick={() => router.replace("/")}>На главную</Button>
      </main>
    );
  }

  const total = users.data?.[0]?.total ?? 0;

  return (
    <div className="min-h-dvh pt-safe">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size={30} />
            <span className="hidden rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent sm:inline">Админ-панель</span>
          </div>
          {profile.is_admin ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await signOut();
                router.replace("/login/");
              }}
            >
              <LogOut className="size-4" /> Выйти
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => router.push("/")}>
              <ArrowLeft className="size-4" /> Главная
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <h1 className="text-[28px] font-extrabold tracking-tight">Админ-панель</h1>
        <p className="mb-4 text-sm text-muted">Вошёл как {profile.display_name} (@{profile.username})</p>

        <div className="mb-4 flex items-center gap-2">
        <Segmented
          ariaLabel="Раздел"
          stretch
          className="flex-1 sm:max-w-md"
          value={tab}
          onChange={setTab}
          options={[
            { value: "users", label: `Пользователи${total ? ` · ${total}` : ""}` },
            { value: "recovery", label: `Заявки${newCount ? ` · ${newCount}` : ""}` },
            { value: "badges", label: "Статусы" },
            { value: "settings", label: "Настройки" },
          ]}
        />
          <button
            onClick={() => (tab === "recovery" ? refetchRecovery() : refetchUsers())}
            aria-label="Обновить"
            title="Обновить"
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-card transition active:scale-95"
          >
            <RefreshCw className="size-5" />
          </button>
        </div>

        {tab === "settings" ? (
          <AdminSettings />
        ) : tab === "badges" ? (
          <BadgesTab />
        ) : tab === "users" ? (
          <>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск по имени, username или почте"
                aria-label="Поиск пользователей"
                autoCapitalize="none"
                className="h-12 w-full rounded-2xl bg-surface pl-12 pr-4 text-base shadow-card outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            {users.loading ? (
              <div className="flex flex-col gap-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
            ) : users.error ? (
              <ErrorState text={humanError(users.error)} onRetry={users.refetch} />
            ) : !users.data?.length ? (
              <EmptyState icon={<Search />} title="Никого не нашли" />
            ) : (
              <>
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {users.data.map((u) => (
                    <li key={u.id} className="min-w-0">
                      <button onClick={() => setOpen(u)} className="flex w-full items-center gap-3 rounded-[20px] bg-surface p-3 text-left shadow-card transition hover:bg-surface-2">
                        <Avatar src={u.avatar_url} name={u.display_name ?? "?"} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-bold">{u.display_name}</span>
                            <StatusBadge userId={u.id} />
                            {u.is_admin && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">Админ</span>}
                            {u.is_blocked && <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">Заблокирован</span>}
                          </span>
                          <span className="block truncate text-[13px] text-muted">@{u.username} · с {new Date(u.created_at).toLocaleDateString("ru-RU")}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-muted">
                          <b className="block text-[15px] text-text">{u.entries_count}</b>{plural(Number(u.entries_count), ["отметка", "отметки", "отметок"])}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {total > users.data.length && (
                  <Button variant="secondary" block className="mt-4" onClick={() => setLimit((l) => l + 50)}>
                    Показать ещё ({total - users.data.length})
                  </Button>
                )}
              </>
            )}
          </>
        ) : recovery.loading ? (
          <Skeleton className="h-40" />
        ) : recovery.error ? (
          <ErrorState text={humanError(recovery.error)} onRetry={recovery.refetch} />
        ) : !recovery.data?.length ? (
          <EmptyState icon={<ShieldCheck />} title="Заявок нет" text="Здесь появятся заявки на восстановление доступа" />
        ) : (
          <>
            <Segmented
              ariaLabel="Статус заявок"
              stretch
              className="mb-4"
              value={reqTab}
              onChange={setReqTab}
              options={[
                { value: "new", label: `Новые · ${count("new")}` },
                { value: "in_progress", label: `В работе · ${count("in_progress")}` },
                { value: "done", label: `Решённые · ${count("done")}` },
              ]}
            />
            {requestsShown.length ? (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {requestsShown.map((r) => (
                  <RecoveryCard key={r.id + r.updated_at} r={r} onOpenUser={openByUsername} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<ShieldCheck />}
                title={reqTab === "new" ? "Новых заявок нет" : reqTab === "in_progress" ? "Нет заявок в работе" : "Решённых заявок пока нет"}
              />
            )}
          </>
        )}
      </main>

      <AdminUserSheet user={open} onClose={() => setOpen(null)} />
    </div>
  );
}
