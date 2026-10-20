"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Messages, type Translator } from "./core";
import type { Locale } from "./constants";

const I18nContext = createContext<{ locale: Locale; messages: Messages } | null>(null);

/** Receives only the active locale's messages from the root layout (dictionaries never enter client bundles). */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext)?.locale ?? "en";
}

export function useT(): Translator {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside <I18nProvider>");
  return useMemo(() => makeT(ctx.locale, ctx.messages), [ctx]);
}
