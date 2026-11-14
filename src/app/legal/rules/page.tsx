import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = { title: "Правила — Настрой" };

// Простой гайд, а не юридический документ: эмодзи, короткий заголовок и объяснение обычными словами
const RULES = [
  { icon: "🤝", title: "Не обижай", text: "Без оскорблений, унижений, угроз и травли, даже в шутку. У каждого свой непростой день, поддержи, а не обесценивай." },
  { icon: "🚫", title: "Без ненависти", text: "Нельзя пропагандировать нацизм и экстремизм, оправдывать насилие и разжигать вражду из-за национальности, веры, пола, ориентации, здоровья или внешности." },
  { icon: "🙅", title: "Не преследуй", text: "Если человек просит оставить его в покое, оставь. Не выслеживай, не выпытывай и не пиши ему снова и снова." },
  { icon: "🔒", title: "Чужое не трогай", text: "Не выкладывай чужие фото, переписки, адреса и телефоны без согласия. Не притворяйся другим человеком." },
  { icon: "📵", title: "Без рекламы", text: "Никаких продаж, ссылок на сторонние сайты и одинаковых сообщений всем подряд. Окно поддержки — для тёплых слов." },
  { icon: "💛", title: "Береги себя", text: "Не призывай к самоповреждению и опасным поступкам. Если очень тяжело, позвони на 112 или на детский телефон доверия 8-800-2000-122." },
];

export default function Rules() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" aria-label="На главную"><Logo size={32} /></Link>
        <Link href="/legal/" className="flex h-11 items-center gap-1 text-sm font-semibold text-accent">
          <ChevronLeft className="size-4" /> Все документы
        </Link>
      </div>
      <h1 className="text-[28px] font-extrabold tracking-tight">Правила</h1>
      <p className="mt-1 text-text-2">«Настрой» — спокойное место. Чтобы так и осталось, помни о главном.</p>

      <ul className="mt-6 flex flex-col gap-3">
        {RULES.map((r) => (
          <li key={r.title} className="flex gap-4 rounded-[24px] bg-surface p-4 shadow-card">
            <span className="text-[34px] leading-none" aria-hidden>{r.icon}</span>
            <div className="min-w-0">
              <h2 className="text-[18px] font-bold leading-tight tracking-tight">{r.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-text-2">{r.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[15px] leading-relaxed text-text-2">
        Если правила нарушают, сообщение могут удалить, а аккаунт заблокировать. Неприятное в своём окне поддержки можно
        удалить самому. О нарушении напиши на{" "}
        <a className="font-semibold text-accent" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. Полные условия
        — в <Link className="font-semibold text-accent" href="/legal/terms/">Пользовательском соглашении</Link>.
      </p>
    </main>
  );
}
