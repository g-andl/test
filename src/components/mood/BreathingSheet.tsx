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
  if (t < 4) return { name: "Вдох", scale: 1.45, dur: 4 };
  if (t < 6) return { name: "Задержи", scale: 1.45, dur: 2 };
  return { name: "Выдох", scale: 1, dur: 6 };
}

/** Светящийся шар из трёх слоёв: внешнее кольцо, среднее и ядро с текстом внутри */
function Orb({ scale = 1, dur = 0.6, idle, children }: { scale?: number; dur?: number; idle?: boolean; children?: React.ReactNode }) {
  const t = { duration: dur, ease: "easeInOut" as const };
  return (
    <div className="relative my-6 flex size-60 items-center justify-center" aria-hidden={!children}>
      <motion.div
        className="absolute size-44 rounded-full bg-accent/10"
        initial={{ scale: 1 }}
        animate={idle ? { scale: [1, 1.1, 1] } : { scale: 1 + (scale - 1) * 1.15 }}
        transition={idle ? { duration: 5, repeat: Infinity, ease: "easeInOut" } : { ...t, delay: 0.1 }}
      />
      <motion.div
        className="absolute size-36 rounded-full bg-accent/20"
        initial={{ scale: 1 }}
        animate={idle ? { scale: [1, 1.07, 1] } : { scale: 1 + (scale - 1) * 1.05 }}
        transition={idle ? { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.3 } : { ...t, delay: 0.05 }}
      />
      <motion.div
        className="relative flex size-28 items-center justify-center rounded-full text-[17px] font-bold text-white"
        style={{
          background: "radial-gradient(circle at 30% 28%, #a9c8ff 0%, var(--accent) 55%, var(--accent-strong) 100%)",
          boxShadow: "0 0 36px 4px rgb(77 141 247 / 0.4), inset 0 -6px 14px rgb(0 0 0 / 0.12)",
        }}
        initial={{ scale: 1 }}
        animate={idle ? { scale: [1, 1.05, 1] } : { scale }}
        transition={idle ? { duration: 5, repeat: Infinity, ease: "easeInOut" } : t}
      >
        {children}
      </motion.div>
    </div>
  );
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
          <p className="max-w-xs text-text-2">Похоже, день непростой. Подышим вместе минуту? Это поможет немного выдохнуть.</p>
          <Orb idle />
          <Button size="lg" block onClick={() => setRunning(true)}>Подышать минуту</Button>
          <Button variant="ghost" block className="mt-2" onClick={onClose}>Не сейчас</Button>
        </>
      ) : done ? (
        <>
          <p className="text-[19px] font-bold">Хорошо. Ты молодец, что остановился.</p>
          <p className="mt-1 max-w-xs text-text-2">Если захочется поделиться, напиши другу или оставь заметку.</p>
          <Orb idle />
          <Button size="lg" block onClick={onClose}>Готово</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">Дыши вместе с кругом</p>
          <Orb scale={p.scale} dur={p.dur}>{p.name}</Orb>
          <div className="mb-2 h-1.5 w-48 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={sec} aria-label="Прошло времени">
            <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, ((sec + 1) / TOTAL) * 100)}%` }} />
          </div>
          <p className="text-[13px] text-muted">Осталось {Math.max(0, TOTAL - sec)} с</p>
          <Button variant="ghost" block className="mt-3" onClick={onClose}>Закончить</Button>
        </>
      )}
    </div>
  );
}

/** Предложение подышать после тяжёлой отметки: минутное упражнение со светящимся кругом */
export function BreathingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Минута дыхания" centerTitle>
      <Body onClose={onClose} />
    </Sheet>
  );
}
