"use client";
import { useEffect, useState } from "react";

/** Читает значения CSS-переменных (для SVG-графиков) и обновляет их при смене темы */
export function useCssVars<T extends string>(names: readonly T[]): Record<T, string> {
  const read = () => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()])) as Record<T, string>;
  };
  const [vals, setVals] = useState<Record<T, string>>(() =>
    typeof window === "undefined" ? (Object.fromEntries(names.map((n) => [n, "#888"])) as Record<T, string>) : read(),
  );
  useEffect(() => {
    const obs = new MutationObserver(() => setVals(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return vals;
}
