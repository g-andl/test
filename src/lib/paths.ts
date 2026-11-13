/** Префикс пути для GitHub Pages (например, /test) */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Путь к файлу из public/ с учётом basePath */
export const asset = (p: string) => `${BASE_PATH}${p.startsWith("/") ? p : `/${p}`}`;

/** Абсолютный адрес страницы приложения (для писем и push) */
export const appUrl = (p: string) =>
  typeof window === "undefined" ? asset(p) : `${window.location.origin}${asset(p)}`;
