"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const Ctx = createContext<{ theme: ThemePref; setTheme: (t: ThemePref) => void }>({ theme: "system", setTheme: () => undefined });
export const useTheme = () => useContext(Ctx);

const KEY = "nastroy-theme";

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b0e14" : "#f2f4f8");
}

/** Скрипт до отрисовки — без вспышки светлой темы */
export const themeScript = `(function(){try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");

  useEffect(() => {
    let saved: ThemePref = "system";
    try {
      saved = (localStorage.getItem(KEY) as ThemePref) || "system";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- синхронизация с localStorage после гидратации
    setThemeState(saved);
    apply(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let cur: ThemePref = "system";
      try { cur = (localStorage.getItem(KEY) as ThemePref) || "system"; } catch {}
      if (cur === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch {}
    apply(t);
  }, []);

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}
