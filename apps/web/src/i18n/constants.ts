/** Dependency-free i18n constants — safe to import from client components. */
export type Locale = "en" | "ar";
export const LOCALES: readonly Locale[] = ["en", "ar"] as const;
export const LOCALE_COOKIE = "tmc_locale";
export const THEME_COOKIE = "tmc_theme";

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "ar";
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
