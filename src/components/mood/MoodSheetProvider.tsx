"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { MoodSheet } from "./MoodSheet";
import { useMyEntries } from "@/hooks/data";
import { todayKey } from "@/lib/dates";
import type { MoodValue } from "@/lib/types";

type Open = (opts?: { date?: string; mood?: MoodValue }) => void;
const Ctx = createContext<Open>(() => undefined);
/** Открыть панель отметки настроения из любого экрана */
export const useMoodSheet = () => useContext(Ctx);

export function MoodSheetProvider({ children }: { children: React.ReactNode }) {
  const { byDate } = useMyEntries();
  const [state, setState] = useState<{ open: boolean; date: string; mood: MoodValue | null }>({
    open: false,
    date: todayKey(),
    mood: null,
  });

  const open = useCallback<Open>((opts) => {
    const date = opts?.date ?? todayKey();
    // Будущие дни отмечать нельзя
    if (date > todayKey()) return;
    setState({ open: true, date, mood: opts?.mood ?? null });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return (
    <Ctx.Provider value={open}>
      {children}
      <MoodSheet
        open={state.open}
        onClose={close}
        date={state.date}
        existing={byDate.get(state.date) ?? null}
        initialMood={state.mood}
      />
    </Ctx.Provider>
  );
}
