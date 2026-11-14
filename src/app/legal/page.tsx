import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, FileText } from "lucide-react";
import { Logo } from "@/components/Logo";
import { DOCS } from "@/components/legal/LegalPage";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = { title: "Документы — Настроение" };

export default function LegalIndex() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/" className="mb-8 inline-block" aria-label="На главную"><Logo size={32} /></Link>
      <h1 className="text-[28px] font-extrabold tracking-tight">Документы</h1>
      <p className="mt-1 text-text-2">Правила сервиса и всё о том, как мы обращаемся с твоими данными.</p>
      <ul className="mt-6 flex flex-col gap-2">
        {DOCS.map((d) => (
          <li key={d.href}>
            <Link href={d.href} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card">
              <FileText className="size-5 shrink-0 text-accent" />
              <span className="flex-1 text-[15px] font-semibold">{d.title}</span>
              <ChevronRight className="size-5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted">
        Вопросы о персональных данных: <a className="font-semibold text-accent" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
      </p>
    </main>
  );
}
