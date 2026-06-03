/** Публичный URL сайта (без завершающего слэша). Нужен для писем Supabase на проде. */
export function getAppOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return "";
}

export function getAuthRedirectUrl(path: string): string {
  const origin = getAppOrigin();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!origin) {
    throw new Error(
      "Задайте VITE_SITE_URL (например https://ваш-сайт.vercel.app) в Vercel и в Supabase → Authentication → URL Configuration.",
    );
  }
  return `${origin}${normalizedPath}`;
}
