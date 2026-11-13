import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Настроено ли подключение к Supabase */
export const isConfigured = Boolean(url && key);

// Единый клиент на всё приложение. Ключ anon — публичный,
// доступ к данным ограничивается правилами RLS в базе.
export const supabase = createClient(url || "http://localhost:54321", key || "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // implicit: ссылка из письма работает на любом устройстве
    flowType: "implicit",
  },
});
