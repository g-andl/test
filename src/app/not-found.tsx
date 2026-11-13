import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="emoji mb-4 text-6xl">🧭</div>
      <h1 className="text-2xl font-extrabold">Страница не найдена</h1>
      <p className="mt-2 text-text-2">Возможно, ссылка устарела.</p>
      <Link href="/" className="mt-6 flex h-12 items-center rounded-2xl bg-ink px-6 font-semibold text-ink-fg">
        На главную
      </Link>
    </main>
  );
}
