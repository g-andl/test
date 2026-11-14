"use client";
import { Plus } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { EntryCard } from "./EntryCard";
import { capitalize, formatLong, fromKey } from "@/lib/dates";
import type { EntryLite, MoodEntry } from "@/lib/types";

/** Все отметки дня в нижней панели */
export function DaySheet({
  date,
  entries,
  onClose,
  onAdd,
  own,
}: {
  date: string | null;
  entries: (EntryLite | MoodEntry)[];
  onClose: () => void;
  onAdd?: (date: string) => void;
  own?: boolean;
}) {
  return (
    <Sheet
      open={!!date}
      onClose={onClose}
      title={date ? capitalize(formatLong(fromKey(date))) : ""}
      footer={
        onAdd && date ? (
          <Button block size="lg" onClick={() => onAdd(date)}>
            <Plus className="size-5" /> Добавить отметку
          </Button>
        ) : undefined
      }
    >
      {entries.length ? (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <div key={e.id} className="rounded-[22px] bg-surface-2 p-1">
              <EntryCard entry={e} own={own} highlight />
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-muted">В этот день отметок нет</p>
      )}
    </Sheet>
  );
}
