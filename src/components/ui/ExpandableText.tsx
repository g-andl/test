"use client";
import { useLayoutEffect, useRef, useState } from "react";

/** Длинный текст: показывает несколько строк, а если он не помещается, появляется «Показать полностью» / «Свернуть» */
export function ExpandableText({ text, lines = 4, className = "" }: { text: string; lines?: 4 | 6; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const clamp = lines === 6 ? "line-clamp-6" : "line-clamp-4";

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const check = () => setOverflow(el.scrollHeight - el.clientHeight > 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <div className="min-w-0">
      <p
        ref={ref}
        onClick={() => (overflow || expanded) && setExpanded((v) => !v)}
        className={`whitespace-pre-line break-words ${expanded ? "" : clamp} ${overflow || expanded ? "cursor-pointer" : ""} ${className}`}
      >
        {text}
      </p>
      {(overflow || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 -mb-1 flex h-9 items-center text-sm font-semibold text-accent"
        >
          {expanded ? "Свернуть" : "Показать полностью"}
        </button>
      )}
    </div>
  );
}
