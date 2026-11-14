import { Home, BookOpen, BarChart3, Users, User } from "lucide-react";

export const NAV = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/diary/", label: "Дневник", icon: BookOpen },
  { href: "/stats/", label: "Статистика", icon: BarChart3 },
  { href: "/friends/", label: "Друзья", icon: Users },
  { href: "/profile/", label: "Профиль", icon: User },
] as const;

/** Активен ли пункт меню для текущего пути */
export function isActive(href: string, pathname: string) {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (href === "/") return p === "/";
  if (href === "/profile/") return p.startsWith("/profile/") || p.startsWith("/settings/");
  if (href === "/friends/") return p.startsWith("/friends/") || p.startsWith("/user/");
  return p.startsWith(href);
}
