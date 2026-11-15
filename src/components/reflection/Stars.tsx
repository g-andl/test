"use client";
import { Star } from "lucide-react";

const LABELS = ["", "Тяжёлый день", "Так себе", "Нормально", "Хороший", "Отличный"];
export const ratingLabel = (n: number | null) => (n ? LABELS[n] : "");

/** Оценка дня звёздами. Без onChange — только показ. */
export function Stars({ value, onChange, size = 28 }: { value: number | null; onChange?: (n: number) => void; size?: number }) {
  return (
    <div role={onChange ? "radiogroup" : "img"} aria-label={value ? `Оценка дня: ${value} из 5` : "Оценка дня"} className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = !!value && n <= value;
        const star = (
          <Star
            style={{ width: size, height: size }}
            className={`transition ${filled ? "fill-[#f5b301] text-[#f5b301]" : "text-line"}`}
            strokeWidth={filled ? 1.5 : 2}
          />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} из 5: ${LABELS[n]}`}
            onClick={() => onChange(n)}
            className="flex size-11 items-center justify-center rounded-xl transition active:scale-90"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}
