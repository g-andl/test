import { isConfigured } from "@/lib/supabase";

/** Если ключи Supabase не заданы при сборке — показываем понятную подсказку вместо пустого экрана */
export function ConfigGate({ children }: { children: React.ReactNode }) {
  if (isConfigured) return <>{children}</>;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      
      <h1 className="text-2xl font-extrabold">Подключите Supabase</h1>
      <p className="mt-3 text-text-2">
        Приложение собрано без ключей. Задайте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY
        (см. файл .env.example и README) и пересоберите проект.
      </p>
    </main>
  );
}
