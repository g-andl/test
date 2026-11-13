"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { summarize, fmtAvg, fmtPct, inRange } from "@/lib/stats";
import { MONTHS, monthGrid, toKey, plural, WEEKDAYS_SHORT } from "@/lib/dates";
import { moodOf } from "@/lib/mood";
import type { EntryLite } from "@/lib/types";

const LIGHT_SOFT: Record<number, string> = { 5: "#e3f6ed", 4: "#e7f0fe", 3: "#eef1f5", 2: "#efecfe", 1: "#fde9e9" };
const MONTH_PREP = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];

/** Рисует карточку месяца в PNG 1080×1350 (без сторонних библиотек) */
async function renderImage(year: number, month: number, entries: EntryLite[], name: string): Promise<Blob> {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const font = css.getPropertyValue("--font-manrope").trim() || "system-ui";
  const emojiFont = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const s = summarize(entries);
  const byDate = new Map(entries.map((e) => [e.entry_date, e]));

  ctx.fillStyle = "#f2f4f8";
  ctx.fillRect(0, 0, W, H);
  const rr = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  rr(60, 60, W - 120, H - 120, 56, "#ffffff");

  ctx.fillStyle = "#8a94a6";
  ctx.font = `600 34px ${font}`;
  ctx.fillText(`${name} · Настрой`, 120, 160);
  ctx.fillStyle = "#0f172a";
  ctx.font = `800 76px ${font}`;
  ctx.fillText(`Мой ${MONTHS[month]}`, 120, 250);

  const top = s.mostFrequent ? moodOf(s.mostFrequent) : null;
  if (top) {
    ctx.font = `150px ${emojiFont}`;
    ctx.fillText(top.emoji, W - 300, 260);
  }

  const tiles = [
    ["Отмечено", `${s.count} ${plural(s.count, ["день", "дня", "дней"])}`],
    ["Среднее", fmtAvg(s.avg)],
    ["Хороших дней", s.count ? fmtPct(s.positive) : "—"],
  ];
  tiles.forEach(([label, value], i) => {
    const x = 120 + i * 290;
    rr(x, 320, 260, 150, 32, "#f5f7fa");
    ctx.fillStyle = "#8a94a6";
    ctx.font = `600 28px ${font}`;
    ctx.fillText(label, x + 28, 372);
    ctx.fillStyle = "#0f172a";
    ctx.font = `800 46px ${font}`;
    ctx.fillText(value, x + 28, 438);
  });

  // Мини-календарь
  const weeks = monthGrid(year, month);
  const cell = 116, gap = 10, gx = 120, gy = 560;
  ctx.font = `600 26px ${font}`;
  ctx.fillStyle = "#8a94a6";
  WEEKDAYS_SHORT.forEach((d, i) => ctx.fillText(d, gx + i * (cell + gap) + 38, gy - 16));
  weeks.forEach((w, wi) =>
    w.forEach((d, di) => {
      if (!d) return;
      const x = gx + di * (cell + gap), y = gy + wi * (cell + gap);
      const e = byDate.get(toKey(d));
      const m = e ? moodOf(e.mood_value) : null;
      // Картинка всегда в светлой теме — фиксированные мягкие цвета
      rr(x, y, cell, cell * 0.8, 24, m ? LIGHT_SOFT[m.value] : "#f5f7fa");
      ctx.fillStyle = "#8a94a6";
      ctx.font = `600 22px ${font}`;
      ctx.fillText(String(d.getDate()), x + 12, y + 30);
      if (m) {
        ctx.font = `48px ${emojiFont}`;
        ctx.fillText(m.emoji, x + cell / 2 - 26, y + cell * 0.8 - 22);
      }
    }),
  );

  ctx.fillStyle = "#8a94a6";
  ctx.font = `600 28px ${font}`;
  ctx.fillText("Узнавай себя. Замечай перемены.", 120, H - 110);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Не удалось создать изображение"))), "image/png"));
}

/** «Твой месяц» — итоги и сохранение картинкой */
export function MonthCard({ entries, name }: { entries: EntryLite[]; name: string }) {
  const toast = useToast();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [busy, setBusy] = useState(false);
  const from = toKey(new Date(ym.y, ym.m, 1, 12));
  const to = toKey(new Date(ym.y, ym.m + 1, 0, 12));
  const month = inRange(entries, from, to);
  const s = summarize(month);
  const top = s.mostFrequent ? moodOf(s.mostFrequent) : null;
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();

  const shift = (d: number) => {
    const dt = new Date(ym.y, ym.m + d, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  async function save() {
    setBusy(true);
    try {
      const blob = await renderImage(ym.y, ym.m, month, name);
      const file = new File([blob], `nastroy-${ym.y}-${String(ym.m + 1).padStart(2, "0")}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] }) && /android|iphone|ipad/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: `Мой ${MONTHS[ym.m]}` }).catch(() => undefined);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast("Картинка сохранена");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold tracking-tight">Твой месяц</h2>
        <div className="flex items-center">
          <button onClick={() => shift(-1)} aria-label="Предыдущий месяц" className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2">
            <ChevronLeft className="size-5" />
          </button>
          <span className="min-w-24 text-center text-sm font-semibold capitalize">{MONTHS[ym.m]} {ym.y !== now.getFullYear() ? ym.y : ""}</span>
          <button onClick={() => shift(1)} disabled={isCurrent} aria-label="Следующий месяц" className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
      {s.count === 0 ? (
        <p className="py-4 text-center text-sm text-muted">В этом месяце отметок нет</p>
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-[20px] p-4" style={{ background: top?.soft }}>
            <span className="emoji text-5xl">{top?.emoji}</span>
            <p className="text-[15px] leading-snug text-text-2">
              В {MONTH_PREP[ym.m]} чаще всего было <b className="text-text">«{top?.label.toLowerCase()}»</b>. Отмечено{" "}
              <b className="text-text">{s.count} {plural(s.count, ["день", "дня", "дней"])}</b>, среднее —{" "}
              <b className="text-text">{fmtAvg(s.avg)}</b>, хороших дней — <b className="text-text">{fmtPct(s.positive)}</b>.
            </p>
          </div>
          <Button variant="secondary" block className="mt-3" onClick={save} loading={busy}>
            <Download className="size-5" /> Сохранить картинкой
          </Button>
        </>
      )}
    </Card>
  );
}
