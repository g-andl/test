// Вход администратора-владельца в чужой аккаунт без пароля и возврат обратно.
// Сессия администратора откладывается в localStorage и возвращается кнопкой «Вернуться в админ-панель».
import { supabase } from "@/lib/supabase";
import { clearCache } from "@/lib/query";
import { asset } from "@/lib/paths";

const KEY = "nastroy-admin-return";

export interface ReturnInfo {
  access_token: string;
  refresh_token: string;
  asName: string;
}

export function readReturn(): ReturnInfo | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReturnInfo) : null;
  } catch {
    return null;
  }
}
/** Сейчас открыт чужой аккаунт из админ-панели: активность и прочтения не засчитываем пользователю */
export const isImpersonating = () => readReturn() !== null;

export async function startImpersonation(userId: string, asName: string) {
  const { data: cur } = await supabase.auth.getSession();
  if (!cur.session) throw new Error("Нужно войти");
  const { data, error } = await supabase.functions.invoke("admin-impersonate", { body: { user_id: userId } });
  if (error) {
    // Текст ошибки от функции лежит в теле ответа
    let msg = error.message;
    try {
      const body = await (error as unknown as { context?: Response }).context?.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  const tokenHash = (data as { token_hash?: string } | null)?.token_hash;
  if (!tokenHash) throw new Error("Не удалось войти");
  const keep: ReturnInfo = { access_token: cur.session.access_token, refresh_token: cur.session.refresh_token, asName };
  localStorage.setItem(KEY, JSON.stringify(keep));
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (vErr) {
    localStorage.removeItem(KEY);
    throw new Error("Не удалось войти в аккаунт");
  }
  clearCache();
  window.location.assign(asset("/"));
}

/** Возвращает сессию администратора и открывает админ-панель */
export async function returnToAdmin() {
  const info = readReturn();
  localStorage.removeItem(KEY);
  clearCache();
  if (info) {
    const { error } = await supabase.auth.setSession({ access_token: info.access_token, refresh_token: info.refresh_token });
    if (!error) {
      window.location.assign(asset("/admin/"));
      return;
    }
  }
  // Сохранённая сессия устарела: выходим из чужого аккаунта и просим войти заново
  await supabase.auth.signOut();
  window.location.assign(asset("/login/?next=/admin/"));
}
