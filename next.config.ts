import type { NextConfig } from "next";

// Для GitHub Pages сайт живёт в подпапке (/имя-репозитория).
// Путь задаётся переменной NEXT_PUBLIC_BASE_PATH при сборке.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Статическая сборка: приложение работает на любом статическом хостинге,
  // вся логика и защита данных — в Supabase.
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
