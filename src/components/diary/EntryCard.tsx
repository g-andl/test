"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { useMoodSheet } from "@/components/mood/MoodSheetProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { moodOf, dayPartOf } from "@/lib/mood";
import { formatTime } from "@/lib/dates";
import { deleteEntry, keys } from "@/lib/api";
import { invalidate } from "@/lib/query";
import { humanError } from "@/lib/errors";
import { usePhoto } from "@/hooks/data";
import type { EntryLite, MoodEntry } from "@/lib/types";

/** Кнопки «изменить» и «удалить» рядом; удаление — в два касания */
export function EntryActions({ entry }: { entry: MoodEntry }) {
  const openMood = useMoodSheet();
  const { session } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Подтверждение само сбрасывается через 3 секунды
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  async function remove() {
    setBusy(true);
    try {
      await deleteEntry(entry);
      invalidate(keys.entries(session!.user.id));
      toast("Отметка удалена");
    } catch (e) {
      toast(humanError(e), "error");
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {confirm ? (
        <button
          onClick={remove}
          disabled={busy}
          className="h-10 rounded-full bg-danger px-4 text-sm font-semibold text-white transition active:scale-95"
        >
          Удалить?
        </button>
      ) : (
        <>
          <button
            onClick={() => openMood({ entry })}
            aria-label="Изменить отметку"
            className="flex size-10 items-center justify-center rounded-full text-text-2 transition hover:bg-surface-2 active:scale-95"
          >
            <Pencil className="size-[18px]" />
          </button>
          <button
            onClick={() => setConfirm(true)}
            aria-label="Удалить отметку"
            className="flex size-10 items-center justify-center rounded-full text-text-2 transition hover:bg-danger-soft hover:text-danger active:scale-95"
          >
            <Trash2 className="size-[18px]" />
          </button>
        </>
      )}
    </div>
  );
}

/** Карточка отметки. Для своих записей — с кнопками действий. */
export function EntryCard({
  entry,
  own,
  highlight,
  compact,
  className = "",
}: {
  compact?: boolean;
  entry: EntryLite | MoodEntry;
  own?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  const m = moodOf(entry.mood_value);
  const photo = usePhoto(entry.photo_path);
  return (
    <div className={`w-full rounded-[20px] p-4 text-left ${className}`} style={{ background: highlight ? m.soft : "var(--surface)" }}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: highlight ? "var(--surface)" : m.soft }}>
          <MoodEmoji value={m.value} size={30} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold" style={{ color: m.color }}>{m.label}</p>
          <p className="text-[13px] text-muted">
            {dayPartOf(entry.day_part).label}, {formatTime(entry.mood_time)}
          </p>
        </div>
        {own && "user_id" in entry && <EntryActions entry={entry as MoodEntry} />}
      </div>
      {entry.note && <p className="mt-3 line-clamp-6 whitespace-pre-line text-[15px] leading-relaxed text-text-2">{entry.note}</p>}
      {photo.data && (
        <img
          src={photo.data}
          alt="Фото к отметке"
          loading="lazy"
          className={`mt-3 w-full rounded-2xl object-cover ${compact ? "h-32 max-w-xs" : "max-h-72"}`}
        />
      )}
    </div>
  );
}
