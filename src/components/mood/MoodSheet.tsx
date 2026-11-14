"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Clock, Lock, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { MOODS, DAY_PARTS, dayPartByHour, moodOf } from "@/lib/mood";
import { combineDateTime, formatRelativeDay, todayKey, formatTime } from "@/lib/dates";
import { saveEntry, deleteEntry, keys } from "@/lib/api";
import { invalidate } from "@/lib/query";
import { humanError } from "@/lib/errors";
import { usePhoto } from "@/hooks/data";
import type { DayPart, MoodEntry, MoodValue } from "@/lib/types";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

type TimeChoice = "now" | DayPart | "exact";

const draftKey = (date: string) => `nastroy-draft-${date}`;

export function MoodSheet({
  open,
  onClose,
  date,
  existing,
  initialMood,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  existing: MoodEntry | null;
  initialMood?: MoodValue | null;
}) {
  const { session } = useAuth();
  const toast = useToast();
  const isToday = date === todayKey();

  const [mood, setMood] = useState<MoodValue | null>(null);
  const [timeChoice, setTimeChoice] = useState<TimeChoice>("now");
  const [exact, setExact] = useState("12:00");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const existingPhoto = usePhoto(existing && !removePhoto ? existing.photo_path : null);

  // Заполняем форму при открытии
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- сброс формы при каждом открытии панели */
    setConfirmDelete(false);
    setPhoto(null);
    setPreview(null);
    setRemovePhoto(false);
    if (existing) {
      setMood(existing.mood_value);
      const t = formatTime(existing.mood_time);
      setExact(t);
      setTimeChoice("exact");
      setNote(existing.note ?? "");
    } else {
      setMood(initialMood ?? null);
      setTimeChoice(isToday ? "now" : "evening");
      const now = new Date();
      setExact(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      let draft = "";
      try { draft = localStorage.getItem(draftKey(date)) ?? ""; } catch {}
      setNote(draft);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, existing, initialMood, date, isToday]);

  // Черновик заметки сохраняется на устройстве — не потеряется при обрыве сети
  useEffect(() => {
    if (!open || existing) return;
    try {
      if (note) localStorage.setItem(draftKey(date), note);
      else localStorage.removeItem(draftKey(date));
    } catch {}
  }, [note, open, existing, date]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const resolved = useMemo(() => {
    let h: number, m: number;
    if (timeChoice === "now") {
      const d = new Date();
      h = d.getHours();
      m = d.getMinutes();
    } else if (timeChoice === "exact") {
      [h, m] = exact.split(":").map(Number);
      if (Number.isNaN(h)) { h = 12; m = 0; }
    } else {
      h = DAY_PARTS.find((p) => p.value === timeChoice)!.hour;
      m = 0;
    }
    return { time: combineDateTime(date, h, m), part: dayPartByHour(h) };
  }, [timeChoice, exact, date]);

  async function onSave() {
    if (!mood || !session || saving) return;
    setSaving(true);
    try {
      await saveEntry(
        session.user.id,
        {
          entry_date: date,
          mood_value: mood,
          note,
          mood_time: resolved.time.toISOString(),
          day_part: resolved.part,
          photo,
          removePhoto,
        },
        existing,
      );
      try { localStorage.removeItem(draftKey(date)); } catch {}
      invalidate(keys.entries(session.user.id));
      if (existing?.photo_path) invalidate(keys.photo(existing.photo_path));
      toast(existing ? "Запись обновлена" : "Настроение отмечено");
      onClose();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!existing || !session) return;
    setSaving(true);
    try {
      await deleteEntry(existing);
      invalidate(keys.entries(session.user.id));
      toast("Запись удалена");
      onClose();
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("Можно прикрепить только изображение", "error");
      return;
    }
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
    setRemovePhoto(false);
  }

  const selected = mood ? moodOf(mood) : null;
  const shownPhoto = preview ?? (!removePhoto ? existingPhoto.data : null);

  const timeOptions: { value: TimeChoice; label: string }[] = [
    ...(isToday ? [{ value: "now" as const, label: "Сейчас" }] : []),
    ...DAY_PARTS.map((p) => ({ value: p.value, label: p.short })),
    { value: "exact", label: "Точное время" },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? "Изменить запись" : isToday ? "Как ты сегодня?" : formatRelativeDay(date)}
      footer={
        confirmDelete ? (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={saving}>
              Отмена
            </Button>
            <Button variant="danger" className="flex-1" onClick={onDelete} loading={saving}>
              Удалить запись
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            {existing && (
              <Button variant="danger" aria-label="Удалить запись" className="w-12 !px-0" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-5" />
              </Button>
            )}
            <Button block size="lg" onClick={onSave} loading={saving} disabled={!mood}>
              {existing ? "Сохранить" : "Отметить настроение"}
            </Button>
          </div>
        )
      }
    >
      {/* Выбор настроения */}
      <div role="radiogroup" aria-label="Настроение" className="grid grid-cols-5 gap-1 min-[380px]:gap-1.5">
        {MOODS.map((m) => {
          const active = mood === m.value;
          return (
            <button
              key={m.value}
              role="radio"
              aria-checked={active}
              aria-label={`${m.label}: ${m.description}`}
              onClick={() => setMood(m.value)}
              className="flex min-h-[84px] min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 transition active:scale-95"
              style={{
                background: active ? m.soft : "var(--surface-2)",
                borderColor: active ? m.color : "transparent",
              }}
            >
              <MoodEmoji value={m.value} size={40} decorative className={`transition duration-200 ${active ? "scale-110" : ""} ${mood && !active ? "opacity-45 grayscale-[50%]" : ""}`} />
              <span className="hidden max-w-full px-0.5 text-[10px] font-semibold leading-none tracking-[-0.01em] text-text-2 min-[385px]:block min-[410px]:text-[11px] min-[460px]:text-xs">{m.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 min-h-5 text-center text-sm font-medium" style={{ color: selected?.color ?? "var(--muted)" }}>
        {selected ? (
          <>
            {/* На узких экранах подписей под эмодзи нет — называем выбранное здесь */}
            <b className="min-[385px]:hidden">{selected.label} · </b>
            {selected.description}
          </>
        ) : (
          "Выбери, что ближе всего"
        )}
      </p>

      {/* Время */}
      <h3 className="mb-2 mt-5 flex items-center gap-1.5 text-sm font-semibold text-text-2">
        <Clock className="size-4" /> Когда
      </h3>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {timeOptions.map((o) => (
          <button
            key={o.value}
            onClick={() => setTimeChoice(o.value)}
            aria-pressed={timeChoice === o.value}
            className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${timeChoice === o.value ? "bg-accent text-white" : "bg-surface-2 text-text-2"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {timeChoice === "exact" && (
        <input
          type="time"
          value={exact}
          onChange={(e) => setExact(e.target.value)}
          aria-label="Точное время"
          className="mt-3 h-12 w-full rounded-2xl bg-surface-2 px-4 text-base outline-none focus:ring-2 focus:ring-accent"
        />
      )}
      <p className="mt-2 text-[13px] text-muted">
        {DAY_PARTS.find((p) => p.value === resolved.part)!.label}, {formatTime(resolved.time.toISOString())}
      </p>

      {/* Заметка */}
      <label htmlFor="mood-note" className="mb-2 mt-5 block text-sm font-semibold text-text-2">
        Заметка <span className="font-normal text-muted">— необязательно</span>
      </label>
      <textarea
        id="mood-note"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 2000))}
        placeholder="Что повлияло на настроение?"
        rows={3}
        className="w-full resize-none rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent focus:bg-surface"
      />

      {/* Фото */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
      {shownPhoto ? (
        <div className="relative mt-3 overflow-hidden rounded-2xl">
          <img src={shownPhoto} alt="Фото к записи" className="max-h-56 w-full object-cover" />
          <button
            onClick={() => {
              setPhoto(null);
              setPreview(null);
              if (existing?.photo_path) setRemovePhoto(true);
            }}
            aria-label="Убрать фото"
            className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full bg-black/55 text-white"
          >
            <X className="size-5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm font-semibold text-text-2 hover:bg-surface-2"
        >
          <Camera className="size-5" /> Добавить фото
        </button>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
        <Lock className="size-3.5" /> Заметки и фото видны только тебе, если не разрешишь друзьям в настройках
      </p>
    </Sheet>
  );
}
