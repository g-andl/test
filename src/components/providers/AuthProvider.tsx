"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { fetchProfile, updateProfile } from "@/lib/api";
import { clearCache } from "@/lib/query";
import { browserTimezone } from "@/lib/dates";
import type { Profile } from "@/lib/types";

interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Пользователь пришёл по ссылке восстановления пароля */
  recovery: boolean;
  refreshProfile: () => Promise<void>;
  setProfile: (p: Profile) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  ready: false, session: null, profile: null, recovery: false,
  refreshProfile: async () => undefined, setProfile: () => undefined, signOut: async () => undefined,
});
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovery, setRecovery] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    try {
      let p = await fetchProfile(s.user.id);
      // Часовой пояс профиля следует за устройством — для корректного «сегодня» у друзей
      const tz = browserTimezone();
      if (p && p.timezone !== tz) p = await updateProfile(p.id, { timezone: tz }).catch(() => p);
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- без настроек показываем экран-подсказку
      setReady(true);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (mounted) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        clearCache();
        setRecovery(false);
      }
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Вызов вне колбэка, чтобы не блокировать клиент авторизации
        setTimeout(() => loadProfile(s), 0);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    clearCache();
    setProfile(null);
    setSession(null);
  }, []);

  return (
    <Ctx.Provider value={{ ready, session, profile, recovery, refreshProfile, setProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
