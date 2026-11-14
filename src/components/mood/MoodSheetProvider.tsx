"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { MoodSheet } from "./MoodSheet";
import { todayKey } from "@/lib/dates";
import type { MoodEntry, MoodValue } from "@/lib/types";

/** Открыть окно отметки: новая отметка (date, mood) или редактирование (entry) */
type Open = (opts?: { date?: string; mood?: MoodValue; entry?: MoodEntry }) => void;
const Ctx = createContext<Open>(() => undefined);
export const useMoodSheet = () => useContext(Ctx);

export function MoodSheetProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; date: string; mood: MoodValue | null; entry: MoodEntry | null }>({
    open: false,
    date: todayKey(),
    mood: null,
    entry: null,
  });

  const open = useCallback<Open>((opts) => {
    const date = opts?.entry?.entry_date ?? opts?.date ?? todayKey();
    // Будущие дни отмечать нельзя
    if (date > todayKey()) return;
    setState({ open: true, date, mood: opts?.mood ?? null, entry: opts?.entry ?? null });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return (
    <Ctx.Provider value={open}>
      {children}
      <MoodSheet open={state.open} onClose={close} date={state.date} existing={state.entry} initialMood={state.mood} />
    </Ctx.Provider>
  );
}
