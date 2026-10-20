"use client";
/**
 * "More" sheet opened from the tab bar: the remaining nav destinations, locale + theme switches,
 * account block and sign out. All text comes in through props (i18n lives with the frontend).
 *
 * Locale: writes the `tmc_locale` cookie, then calls `onLocaleChange` (pass the `setLocale` server
 * action) and refreshes. Theme: UI-only — writes `tmc_theme` (absent = system) and sets
 * <html data-theme>, exactly as the website does; `onThemeChange` is an optional extra hook.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { LOCALE_COOKIE, THEME_COOKIE, type Locale } from "@/i18n/core";
import { BottomSheet } from "./BottomSheet";
import { MobileIcon, renderIcon, type MobileIconName } from "./icons";

export type ThemeChoice = "light" | "dark" | "system";

export interface MoreMenuItem {
  href: string;
  label: string;
  icon: MobileIconName | ReactNode;
  /** Unread/attention count; 0/undefined hides the badge. */
  badge?: number;
  /** Accessible text for the badge, e.g. "3 unread". */
  badgeLabel?: string;
  /** Extra path prefixes that make this item "current". */
  match?: string[];
}

export interface MoreMenuLabels {
  title: string;
  close: string;
  language: string;
  theme: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
}

export interface MoreMenuProps {
  open: boolean;
  onClose: () => void;
  items: MoreMenuItem[];
  labels: MoreMenuLabels;
  locale: Locale;
  /** Server action (e.g. `setLocale`) or any async handler. Cookie is already written when it runs. */
  onLocaleChange?: (locale: Locale) => unknown | Promise<unknown>;
  /** Current cookie value: "light" | "dark" | null (system). */
  theme: "light" | "dark" | null;
  onThemeChange?: (theme: ThemeChoice) => void;
  /** Account block: name, company, TMC-ID… */
  account?: ReactNode;
  /** The frontend's sign-out button/form (keeps auth code out of this primitive). */
  signOut?: ReactNode;
}

const YEAR = 60 * 60 * 24 * 365;
function writeCookie(name: string, value: string | null) {
  document.cookie = value === null
    ? `${name}=; path=/; max-age=0; samesite=lax`
    : `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

export function isPathActive(pathname: string, href: string, match: string[] = []): boolean {
  return [href, ...match].some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

export function MoreMenu({
  open, onClose, items, labels, locale, onLocaleChange, theme, onThemeChange, account, signOut,
}: MoreMenuProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [themeNow, setThemeNow] = useState<ThemeChoice>(theme ?? "system");
  useEffect(() => setThemeNow(theme ?? "system"), [theme]);

  // close when navigation lands
  const [openedAt, setOpenedAt] = useState(pathname);
  useEffect(() => { if (open) setOpenedAt(pathname); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && pathname !== openedAt) onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseLocale = (l: Locale) => {
    if (l === locale || pending) return;
    writeCookie(LOCALE_COOKIE, l);
    startTransition(async () => {
      await onLocaleChange?.(l);
      router.refresh();
    });
  };

  const chooseTheme = (t: ThemeChoice) => {
    setThemeNow(t);
    writeCookie(THEME_COOKIE, t === "system" ? null : t);
    const root = document.documentElement;
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    onThemeChange?.(t);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={labels.title} closeLabel={labels.close} className="m-more">
      {account ? <div className="m-more-account">{account}</div> : null}

      <nav aria-label={labels.title}>
        <ul className="m-more-list">
          {items.map((it) => {
            const current = isPathActive(pathname, it.href, it.match);
            return (
              <li key={it.href}>
                <Link href={it.href} className="m-more-link" aria-current={current ? "page" : undefined} onClick={onClose}>
                  <span className="m-more-ic">{renderIcon(it.icon, 22)}</span>
                  <span className="m-more-label">{it.label}</span>
                  {it.badge ? (
                    <span className="badge" aria-label={it.badgeLabel}>{it.badge > 99 ? "99+" : it.badge}</span>
                  ) : null}
                  <MobileIcon name="chevron" size={18} className="m-more-chev" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="m-more-prefs">
        <fieldset className="m-seg-field" aria-busy={pending || undefined}>
          <legend><MobileIcon name="globe" size={18} />{labels.language}</legend>
          <div className="m-seg">
            {([["en", "English"], ["ar", "العربية"]] as const).map(([l, name]) => (
              <label key={l} lang={l} dir={l === "ar" ? "rtl" : "ltr"}>
                <input type="radio" name="m-locale" value={l} checked={locale === l} onChange={() => chooseLocale(l)} />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="m-seg-field">
          <legend><MobileIcon name={themeNow === "dark" ? "moon" : "sun"} size={18} />{labels.theme}</legend>
          <div className="m-seg">
            {([["light", labels.themeLight, "sun"], ["dark", labels.themeDark, "moon"], ["system", labels.themeSystem, "system"]] as const).map(
              ([t, name, ic]) => (
                <label key={t}>
                  <input type="radio" name="m-theme" value={t} checked={themeNow === t} onChange={() => chooseTheme(t)} />
                  <span><MobileIcon name={ic} size={18} />{name}</span>
                </label>
              ),
            )}
          </div>
        </fieldset>
      </div>

      {signOut ? <div className="m-more-signout">{signOut}</div> : null}
    </BottomSheet>
  );
}
