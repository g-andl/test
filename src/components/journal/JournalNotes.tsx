"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Lock, Globe, Users, NotebookPen, Pencil, Plus, Trash2, Folder, Settings2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, invalidate } from "@/lib/query";
import {
  fetchJournal, saveJournalNote, deleteJournalNote, fetchPrivacy, keys, fetchJournalGroups, createJournalGroup, renameJournalGroup, deleteJournalGroup,
  type JournalNote, type JournalGroup,
} from "@/lib/api";
import { humanError } from "@/lib/errors";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) +
  ", " +
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function NoteCard({ note, groupName, onEdit }: { note: JournalNote; groupName?: string; onEdit?: () => void }) {
  return (
    <Card as="article" className="!p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {groupName && (
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
              <Folder className="size-3" /> {groupName}
            </span>
          )}
          {note.title && <h3 className="break-words text-[17px] font-bold leading-snug">{note.title}</h3>}
          <p className="text-[13px] text-muted">
            {fmtDate(note.created_at)}
            {note.updated_at !== note.created_at && new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 60000 ? " · изменена" : ""}
          </p>
        </div>
        {onEdit && (
          <button onClick={onEdit} aria-label="Изменить заметку" className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
            <Pencil className="size-5" />
          </button>
        )}
      </div>
      <div className="mt-2">
        <ExpandableText text={note.body} lines={6} className="text-[15px] leading-relaxed text-text-2" />
      </div>
    </Card>
  );
}

function Editor({ note, groups, defaultGroup, onClose }: { note: JournalNote | null; groups: JournalGroup[]; defaultGroup: string | null; onClose: () => void }) {
  const { session } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [group, setGroup] = useState<string>(note ? (note.group_id ?? "") : (defaultGroup ?? ""));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const uid = session?.user.id;

  async function save() {
    if (!uid) return;
    setBusy(true);
    try {
      await saveJournalNote(uid, note?.id ?? null, title, body, group || null);
      invalidate(keys.journal(uid));
      toast(note ? "Заметка сохранена" : "Заметка добавлена");
      onClose();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!note || !uid) return;
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await deleteJournalNote(note.id);
      invalidate(keys.journal(uid));
      toast("Заметка удалена");
      onClose();
    } catch (e) {
      toast(humanError(e), "error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 120))}
        placeholder="Заголовок (необязательно)"
        aria-label="Заголовок заметки"
        className="h-13 w-full rounded-2xl border border-transparent bg-surface-2 px-4 text-[17px] font-bold outline-none placeholder:font-normal placeholder:text-muted focus:border-accent focus:bg-surface"
      />
      <label className="flex items-center gap-3 text-sm font-semibold text-text-2">
        <span className="flex items-center gap-1.5"><Folder className="size-4" /> Группа</span>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          aria-label="Группа заметки"
          className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] text-text outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Без группы</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Что происходит? Пиши сколько нужно: здесь нет ограничения, как в отметках"
        aria-label="Текст заметки"
        rows={10}
        className="min-h-[40vh] w-full resize-y rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-base leading-relaxed outline-none placeholder:text-muted focus:border-accent focus:bg-surface"
      />
      <p className="text-right text-xs text-muted">{body.length.toLocaleString("ru-RU")} символов</p>
      <div className="flex items-center justify-between gap-3">
        {note ? (
          <Button variant="danger" size="sm" loading={busy && confirm} onClick={remove} disabled={busy && !confirm}>
            <Trash2 className="size-4" /> {confirm ? "Точно удалить?" : "Удалить"}
          </Button>
        ) : (
          <span />
        )}
        <Button loading={busy && !confirm} disabled={!body.trim() || (busy && confirm)} onClick={save}>Сохранить</Button>
      </div>
    </div>
  );
}

const SUGGESTED = ["Личное", "Отношения", "Работа", "Мечты и идеи"];

/** Создание, переименование и удаление групп. Заметки удалённой группы остаются без группы. */
function GroupsManager({ groups, onClose }: { groups: JournalGroup[]; onClose: () => void }) {
  const { session } = useAuth();
  const toast = useToast();
  const uid = session?.user.id;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [delId, setDelId] = useState<string | null>(null);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      if (uid) {
        invalidate(keys.journalGroups(uid));
        invalidate(keys.journal(uid));
      }
      toast(ok);
      return true;
    } catch (e) {
      toast(/duplicate|unique|23505/i.test(String(e instanceof Error ? e.message : e)) ? "Такая группа уже есть" : humanError(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const taken = (n: string) => groups.some((g) => g.name.trim().toLowerCase() === n.trim().toLowerCase());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-text-2">Новая группа</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="Например: Путешествия"
            aria-label="Название новой группы"
            className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
          />
          <Button
            size="sm"
            disabled={!name.trim() || taken(name)}
            loading={busy}
            onClick={async () => { if (uid && (await run(() => createJournalGroup(uid, name), "Группа создана"))) setName(""); }}
          >
            Создать
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED.filter((n) => !taken(n)).map((n) => (
            <button
              key={n}
              onClick={() => uid && run(() => createJournalGroup(uid, n), "Группа создана")}
              className="h-9 rounded-full bg-surface-2 px-3 text-sm font-semibold text-text-2 transition active:scale-95"
            >
              + {n}
            </button>
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2 pl-4">
              {editId === g.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value.slice(0, 40))}
                    aria-label="Новое название группы"
                    autoFocus
                    className="h-10 min-w-0 flex-1 rounded-xl bg-surface px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
                  />
                  <Button size="sm" disabled={!editName.trim() || (taken(editName) && editName.trim().toLowerCase() !== g.name.toLowerCase())} loading={busy} onClick={async () => { if (await run(() => renameJournalGroup(g.id, editName), "Название изменено")) setEditId(null); }}>
                    Сохранить
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{g.name}</span>
                  <button onClick={() => { setEditId(g.id); setEditName(g.name); setDelId(null); }} aria-label={`Переименовать ${g.name}`} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface">
                    <Pencil className="size-4" />
                  </button>
                  {delId === g.id ? (
                    <Button size="sm" variant="danger" loading={busy} onClick={async () => { if (await run(() => deleteJournalGroup(g.id), "Группа удалена")) setDelId(null); }}>
                      Точно удалить?
                    </Button>
                  ) : (
                    <button onClick={() => { setDelId(g.id); setTimeout(() => setDelId((x) => (x === g.id ? null : x)), 3000); }} aria-label={`Удалить группу ${g.name}`} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">Если удалить группу, заметки из неё не пропадут: они останутся без группы.</p>
      <Button variant="secondary" block onClick={onClose}>Готово</Button>
    </div>
  );
}

const WHO = {
  me: { icon: Lock, text: "Видишь только ты" },
  friends: { icon: Users, text: "Видят друзья" },
  all: { icon: Globe, text: "Видят все пользователи" },
} as const;

/** Раздел «Заметки» в моём дневнике: свободные записи без лимита отметки */
export function JournalNotesOwn({ newSignal = 0 }: { newSignal?: number }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const q = useQuery(uid ? keys.journal(uid) : null, () => fetchJournal(uid!));
  const gq = useQuery(uid ? keys.journalGroups(uid) : null, () => fetchJournalGroups(uid!));
  const privacy = useQuery(keys.privacy, fetchPrivacy);
  const [editing, setEditing] = useState<JournalNote | "new" | null>(null);
  const [managing, setManaging] = useState(false);
  // Внешний сигнал (кнопка «Заметка» в заголовке или «+» на телефоне) открывает новую заметку
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- открываем редактор по сигналу снаружи
    if (newSignal > 0) setEditing("new");
  }, [newSignal]);
  // "all" — все, "none" — без группы, иначе id группы
  const [filter, setFilter] = useState<string>("all");
  const who = WHO[privacy.data?.journal_visibility ?? "me"];
  const groups = gq.data ?? [];
  const notes = q.data ?? [];
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name;
  const shown = notes.filter((n) => (filter === "all" ? true : filter === "none" ? n.group_id === null : n.group_id === filter));
  const hasUngrouped = notes.some((n) => n.group_id === null);
  const activeFilter = filter !== "all" && filter !== "none" && !groups.some((g) => g.id === filter) ? "all" : filter;
  const chip = (id: string, label: string, count: number) => (
    <button
      key={id}
      role="tab"
      aria-selected={activeFilter === id}
      onClick={() => setFilter(id)}
      className={`h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition active:scale-95 ${activeFilter === id ? "bg-ink text-ink-fg" : "bg-surface text-text-2 shadow-card"}`}
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  );

  return (
    <div className="lg:max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link href="/settings/privacy/" className="flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-text">
          <who.icon className="size-4" /> {who.text} · изменить
        </Link>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Новая заметка
        </Button>
      </div>

      <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 min-[380px]:-mx-5 min-[380px]:px-5 lg:mx-0 lg:px-0" role="tablist" aria-label="Группы заметок">
        {chip("all", "Все", notes.length)}
        {groups.map((g) => chip(g.id, g.name, notes.filter((n) => n.group_id === g.id).length))}
        {hasUngrouped && groups.length > 0 && chip("none", "Без группы", notes.filter((n) => n.group_id === null).length)}
        <button onClick={() => setManaging(true)} className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-line px-4 text-sm font-semibold text-text-2">
          <Settings2 className="size-4" /> {groups.length ? "Группы" : "Создать группу"}
        </button>
      </div>

      {q.loading ? (
        <div className="flex flex-col gap-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : q.error ? (
        <ErrorState text={humanError(q.error)} onRetry={q.refetch} />
      ) : !notes.length ? (
        <EmptyState icon={<NotebookPen />} title="Заметок пока нет" text="Пиши сюда мысли, события и всё, что хочется сохранить: без ограничений по длине. Заметки можно раскладывать по группам" action={<Button onClick={() => setEditing("new")}>Написать заметку</Button>} />
      ) : !shown.length ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">В этой группе пока нет заметок</p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((n) => (
            <NoteCard key={n.id} note={n} groupName={activeFilter === "all" ? groupName(n.group_id) : undefined} onEdit={() => setEditing(n)} />
          ))}
        </div>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Новая заметка" : "Заметка"} wide>
        {editing !== null && (
          <Editor
            key={editing === "new" ? "new" : editing.id}
            note={editing === "new" ? null : editing}
            groups={groups}
            defaultGroup={activeFilter !== "all" && activeFilter !== "none" ? activeFilter : null}
            onClose={() => setEditing(null)}
          />
        )}
      </Sheet>
      <Sheet open={managing} onClose={() => setManaging(false)} title="Группы заметок">
        {managing && <GroupsManager groups={groups} onClose={() => setManaging(false)} />}
      </Sheet>
    </div>
  );
}

/** Чужие заметки, которые автор открыл: только чтение */
export function JournalReadList({ notes, groups = [] }: { notes: JournalNote[]; groups?: JournalGroup[] }) {
  return (
    <div className="flex flex-col gap-3">
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} groupName={groups.find((g) => g.id === n.group_id)?.name} />
      ))}
    </div>
  );
}
