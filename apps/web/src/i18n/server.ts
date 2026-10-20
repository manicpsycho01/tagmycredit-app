import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { en } from "./en";
import { ar } from "./ar";
import { LOCALE_COOKIE, THEME_COOKIE, isLocale, type Locale } from "./constants";
import { makeT, type Messages } from "./core";

const dictionaries: Record<Locale, Messages> = { en, ar };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

export const getLocale = cache(async (): Promise<Locale> => {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : "en";
});

export const getTheme = cache(async (): Promise<"light" | "dark" | null> => {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return v === "light" || v === "dark" ? v : null;
});

export const getT = cache(async () => {
  const locale = await getLocale();
  return makeT(locale, dictionaries[locale]);
});
