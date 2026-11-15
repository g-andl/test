"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";

// Цикл 12 секунд: вдох 4, задержка 2, выдох 6. Пять циклов — ровно минута.
const CYCLE = 12;
const TOTAL = 60;
function phase(sec: number): { name: string; scale: number; dur: number } {
  const t = sec % CYCLE;
  if (t < 4) return { name: "Вдох", scale: 1.6, dur: 4 };
  if (t < 6) return { name: "Задержи дыхание", scale: 1.6, dur: 2 };
  return { name: "Медленный выдох", scale: 1, dur: 6 };
}

function Body({ onClose }: { onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const done = running && sec >= TOTAL;
  const p = phase(sec);

  return (
    <div className="flex flex-col items-center pb-2 text-center">
      {!running ? (
        <>
          <p className="max-w-xs text-text-2">Похоже, день непростой. Хочешь минуту подышать вместе? Это поможет немного выдохнуть.</p>
          <div className="my-8 size-24 rounded-full bg-accent-soft" />
          <Button size="lg" block onClick={() => setRunning(true)}>Подышать минуту</Button>
          <Button variant="ghost" block className="mt-2" onClick={onClose}>Не сейчас</Button>
        </>
      ) : done ? (
        <>
          <p className="text-[19px] font-bold">Хорошо. Ты молодец, что остановился.</p>
          <p className="mt-1 max-w-xs text-text-2">Если захочется поделиться, напиши другу или оставь заметку.</p>
          <div className="my-8 size-24 rounded-full bg-accent-soft" />
          <Button size="lg" block onClick={onClose}>Готово</Button>
        </>
      ) : (
        <>
          <p className="text-[19px] font-bold" aria-live="polite">{p.name}</p>
          <div className="my-10 flex size-44 items-center justify-center">
            <motion.div
              className="size-24 rounded-full bg-accent shadow-[0_0_40px_rgb(77_141_247/0.5)]"
              initial={{ scale: 1 }}
              animate={{ scale: p.scale }}
              transition={{ duration: p.dur, ease: "easeInOut" }}
            />
          </div>
          <p className="text-sm text-muted">Осталось {Math.max(0, TOTAL - sec)} с</p>
          <Button variant="ghost" block className="mt-3" onClick={onClose}>Закончить</Button>
        </>
      )}
    </div>
  );
}

/** Предложение подышать после тяжёлой отметки: минутное упражнение с кругом, который растёт и сжимается */
export function BreathingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Минута дыхания">
      <Body onClose={onClose} />
    </Sheet>
  );
}
