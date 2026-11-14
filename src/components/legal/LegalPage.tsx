import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LEGAL_DATE } from "@/lib/legal";

const DOCS = [
  { href: "/legal/rules/", title: "Правила" },
  { href: "/legal/terms/", title: "Пользовательское соглашение" },
  { href: "/legal/privacy/", title: "Политика обработки персональных данных" },
  { href: "/legal/consent/", title: "Согласие на обработку персональных данных" },
  { href: "/legal/distribution/", title: "Согласие на распространение персональных данных" },
];

/** Оформление юридического документа: читаемая колонка, оглавление документов внизу */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" aria-label="На главную"><Logo size={32} /></Link>
        <Link href="/legal/" className="flex h-11 items-center gap-1 text-sm font-semibold text-accent">
          <ChevronLeft className="size-4" /> Все документы
        </Link>
      </div>
      <article className="rounded-[28px] bg-surface p-5 shadow-card sm:p-8 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-[19px] [&_h2]:font-bold [&_li]:mb-1.5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 text-[15px] leading-relaxed text-text-2 [&_b]:text-text [&_a]:font-semibold [&_a]:text-accent">
        <h1 className="mb-2 text-[26px] font-extrabold leading-tight tracking-tight text-text sm:text-[30px]">{title}</h1>
        <p className="mb-6 text-sm text-muted">Редакция от {LEGAL_DATE}</p>
        {children}
      </article>
      <nav aria-label="Документы" className="mt-6 flex flex-col gap-1">
        {DOCS.map((d) => (
          <Link key={d.href} href={d.href} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-text-2 hover:bg-surface">
            {d.title}
          </Link>
        ))}
      </nav>
    </main>
  );
}

export { DOCS };
