"use client";
import { useId, useState } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/States";
import { Stars, ratingLabel } from "./Stars";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useQuery, setQueryData } from "@/lib/query";
import { fetchReflections, saveReflection, keys, type DayReflection } from "@/lib/api";
import { todayKey } from "@/lib/dates";
import { humanError } from "@/lib/errors";

const MAX = 1000;

/** «Итоги дня» на главной: оценка звёздами, что порадовало и что разочаровало. Видно только мне. */
export function ReflectionCard() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const q = useQuery(uid ? keys.reflections(uid) : null, () => fetchReflections(uid!));
  if (!uid) return null;
  if (!q.data) return <Skeleton className="h-40" />;
  // Форма создаётся, когда данные уже пришли, поэтому сохранённое подставляется сразу и ничего не затирается
  return <ReflectionForm uid={uid} saved={q.data.find((r) => r.day === todayKey()) ?? null} />;
}

function ReflectionForm({ uid, saved }: { uid: string; saved: DayReflection | null }) {
  const toast = useToast();
  // Карточка выводится дважды (телефон и компьютер): id полей должны быть разными
  const uid2 = useId();
  const day = todayKey();
  const [rating, setRating] = useState<number | null>(saved?.rating ?? null);
  const [good, setGood] = useState(saved?.good ?? "");
  const [bad, setBad] = useState(saved?.bad ?? "");
  const [insight, setInsight] = useState(saved?.insight ?? "");
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState({ good: saved?.good ?? "", bad: saved?.bad ?? "", insight: saved?.insight ?? "" });

  const dirty = good !== lastSaved.good || bad !== lastSaved.bad || insight !== lastSaved.insight;

  async function save(patch: { good?: string | null; bad?: string | null; insight?: string | null; rating?: number | null }, ok?: string) {
    setBusy(true);
    try {
      await saveReflection(uid, day, patch);
      // Обновляем кэш на месте (а не сбрасываем): форма не пересоздаётся и набранный текст не пропадает
      setQueryData<DayReflection[]>(keys.reflections(uid), (prev = []) => {
        const cur = prev.find((r) => r.day === day);
        const row: DayReflection = { day, good: cur?.good ?? null, bad: cur?.bad ?? null, insight: cur?.insight ?? null, rating: cur?.rating ?? null, updated_at: new Date().toISOString(), ...patch };
        return [row, ...prev.filter((r) => r.day !== day)].sort((x, y) => y.day.localeCompare(x.day));
      });
      if (patch.good !== undefined || patch.bad !== undefined || patch.insight !== undefined) setLastSaved({ good: patch.good ?? "", bad: patch.bad ?? "", insight: patch.insight ?? "" });
      if (ok) toast(ok);
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold tracking-tight">Итоги дня</h2>
      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
        <Lock className="size-3.5" /> Видно только тебе
      </p>

      <p className="mb-1 mt-4 text-sm font-semibold text-text-2">Каким был день в целом?</p>
      <div className="flex flex-wrap items-center gap-x-3">
        <Stars
          value={rating}
          onChange={(n) => {
            setRating(n);
            void save({ rating: n });
          }}
        />
        <span className="text-sm font-semibold text-text-2">{ratingLabel(rating)}</span>
      </div>

      <label htmlFor={`${uid2}-good`} className="mb-1.5 mt-4 block text-sm font-semibold text-text-2">Что порадовало?</label>
      <textarea
        id={`${uid2}-good`}
        value={good}
        onChange={(e) => setGood(e.target.value.slice(0, MAX))}
        rows={2}
        placeholder="Даже мелочь: вкусный кофе, хорошая новость"
        className="max-h-60 w-full resize-y rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent focus:bg-surface"
      />
      <label htmlFor={`${uid2}-bad`} className="mb-1.5 mt-3 block text-sm font-semibold text-text-2">Что разочаровало или не понравилось?</label>
      <textarea
        id={`${uid2}-bad`}
        value={bad}
        onChange={(e) => setBad(e.target.value.slice(0, MAX))}
        rows={2}
        placeholder="Что пошло не так, что огорчило"
        className="max-h-60 w-full resize-y rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent focus:bg-surface"
      />
      <label htmlFor={`${uid2}-insight`} className="mb-1.5 mt-3 block text-sm font-semibold text-text-2">Что понял или чему научился?</label>
      <textarea
        id={`${uid2}-insight`}
        value={insight}
        onChange={(e) => setInsight(e.target.value.slice(0, MAX))}
        rows={2}
        placeholder="Инсайт, вывод, что хочешь запомнить на будущее"
        className="max-h-60 w-full resize-y rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent focus:bg-surface"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted">{!dirty && (lastSaved.good || lastSaved.bad || lastSaved.insight) ? "Сохранено" : ""}</span>
        <Button
          size="sm"
          disabled={!dirty}
          loading={busy}
          onClick={() => save({ good: good.trim() || null, bad: bad.trim() || null, insight: insight.trim() || null }, "Итоги дня сохранены")}
        >
          Сохранить
        </Button>
      </div>
    </Card>
  );
}
