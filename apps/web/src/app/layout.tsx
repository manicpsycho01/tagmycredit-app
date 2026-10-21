import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/app.css";
import "@/styles/map.css";
import "@/styles/mobile.css";
import { arabic, body, display } from "./fonts";
import { getLocale, getMessages, getT, getTheme } from "@/i18n/server";
import { dirOf } from "@/i18n/constants";
import { I18nProvider } from "@/i18n/client";
import { ToastProvider } from "@/components/ui/Toast";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: { default: `${t("common.appName")} · ${t("common.tagline")}`, template: `%s · ${t("common.appName")}` }, description: t("landing.sub") };
}

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0B3D3A" }, { media: "(prefers-color-scheme: dark)", color: "#0E2C2A" }],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, theme, t] = await Promise.all([getLocale(), getTheme(), getT()]);
  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme ?? undefined} className={`${display.variable} ${body.variable} ${arabic.variable}`} suppressHydrationWarning>
      <body>
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          <ToastProvider closeLabel={t("common.close")}>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
