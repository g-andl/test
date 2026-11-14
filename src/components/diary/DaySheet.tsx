"use client";
import { Pencil } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { EntryCard } from "./EntryCard";
import { capitalize, formatLong, fromKey } from "@/lib/dates";
import type { EntryLite } from "@/lib/types";

/** Подробности дня в нижней панели */
export function DaySheet({
  date,
  entry,
  onClose,
  onEdit,
}: {
  date: string | null;
  entry: EntryLite | null | undefined;
  onClose: () => void;
  onEdit?: (date: string) => void;
}) {
  return (
    <Sheet
      open={!!date}
      onClose={onClose}
      title={date ? capitalize(formatLong(fromKey(date))) : ""}
      footer={
        onEdit && date ? (
          <Button block size="lg" onClick={() => onEdit(date)}>
            <Pencil className="size-5" /> {entry ? "Изменить запись" : "Отметить настроение"}
          </Button>
        ) : undefined
      }
    >
      {entry ? (
        <div className="rounded-[22px] bg-surface-2 p-1">
          <EntryCard entry={entry} highlight />
        </div>
      ) : (
        <p className="py-6 text-center text-muted">В этот день отметки нет</p>
      )}
    </Sheet>
  );
}
