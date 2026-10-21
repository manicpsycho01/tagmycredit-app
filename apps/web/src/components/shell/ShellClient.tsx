"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { MobileTabBar, MobileIcon, isPathActive } from "../mobile";
import { useLocale, useT } from "@/i18n/client";
import { LOCALE_COOKIE, THEME_COOKIE, type Locale } from "@/i18n/constants";
import { setLocale } from "@/server/actions";
import { signOut } from "@/lib/auth-client";
import type { NavItem } from "./nav";

type Theme = "light" | "dark" | null;
const YEAR = 60 * 60 * 24 * 365;
const writeCookie = (n: string, v: string | null) => {
  document.cookie = v === null ? `${n}=; path=/; max-age=0; samesite=lax` : `${n}=${v}; path=/; max-age=${YEAR}; samesite=lax`;
};
export function applyTheme(theme: Theme) {
  writeCookie(THEME_COOKIE, theme);
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}
function effectiveTheme(): "light" | "dark" {
  const a = document.documentElement.getAttribute("data-theme");
  if (a === "light" || a === "dark") return a;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useSignOut() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return { pending, run: () => start(async () => { try { await signOut(); } finally { router.push("/"); router.refresh(); } }) };
}

export function ThemeButton({ className = "icon-btn" }: { className?: string }) {
  const t = useT();
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(effectiveTheme() === "dark"), []);
  return (
    <button type="button" className={`${className} theme-btn`} aria-label={dark ? t("ui.themeLight") : t("ui.themeDark")} title={t("ui.theme")}
      onClick={() => { const next = effectiveTheme() === "dark" ? "light" : "dark"; applyTheme(next); setDark(next === "dark"); }}>
      <MobileIcon name={dark ? "sun" : "moon"} />
    </button>
  );
}

export function LocaleButton({ className = "icon-btn lang-btn" }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next: Locale = locale === "ar" ? "en" : "ar";
  return (
    <button type="button" className={className} lang={next} aria-label={t("ui.switchLanguageLabel")} disabled={pending}
      onClick={() => start(async () => { writeCookie(LOCALE_COOKIE, next); try { await setLocale(next); } catch { /* cookie already set */ } router.refresh(); })}>
      {t("ui.switchLanguage")}
    </button>
  );
}

export function DesktopNav({ items }: { items: NavItem[] }) {
  const t = useT();
  const path = usePathname() ?? "";
  return (
    <nav className="app-nav" aria-label={t("nav.main")}>
      <div className="wrap"><ul>
        {items.map((i) => (
          <li key={i.href}><Link href={i.href} aria-current={isPathActive(path, i.href, i.match) ? "page" : undefined}>
            {t(i.label)}{i.badge ? <span className="badge">{i.badge}</span> : null}
          </Link></li>
        ))}
      </ul></div>
    </nav>
  );
}

export function UserMenu({ name, email, sub }: { name: string; email: string; sub: string }) {
  const t = useT();
  const so = useSignOut();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t("ui.userMenu")} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">{initials}</span><span className="uname">{name.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="who"><b>{name}</b><small>{email}</small><small>{sub}</small></div>
          <button type="button" role="menuitem" className="mi" onClick={so.run} disabled={so.pending}>
            <MobileIcon name="signout" />{so.pending ? t("ui.signingOut") : t("ui.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export function ShellTabBar({ items, theme, account }: { items: NavItem[]; theme: Theme; account: { name: string; sub: string } }) {
  const t = useT();
  const locale = useLocale();
  const so = useSignOut();
  const map = (i: NavItem) => ({ href: i.href, label: t(i.label), icon: i.icon, match: i.match, badge: i.badge, badgeLabel: i.badge ? t("ui.notificationsUnread", { n: i.badge }) : undefined });
  const tabs = items.slice(0, 4).map((i) => ({ ...map(i), label: t(i.short ?? i.label) }));
  const more = items.slice(4).map(map);
  const moreBadge = more.reduce((n, i) => n + (i.badge ?? 0), 0);
  return (
    <MobileTabBar ariaLabel={t("nav.main")} items={tabs} more={{
      label: t("ui.menu"), badge: moreBadge || undefined, badgeLabel: moreBadge ? t("ui.notificationsUnread", { n: moreBadge }) : undefined,
      items: more, locale, theme,
      labels: { title: t("ui.menu"), close: t("common.close"), language: t("ui.language"), theme: t("ui.theme"), themeLight: t("ui.themeLightShort"), themeDark: t("ui.themeDarkShort"), themeSystem: t("ui.themeSystem") },
      onLocaleChange: (l) => setLocale(l),
      account: <div className="stack" style={{ gap: 2 }}><b>{account.name}</b><small className="muted">{account.sub}</small></div>,
      signOut: <button type="button" className="btn btn-line btn-block" onClick={so.run} disabled={so.pending}>{so.pending ? t("ui.signingOut") : t("ui.signOut")}</button>,
    }} />
  );
}
