/**
 * Display-only formatters (no business rules). Money arrives as integer halalas.
 * Latin digits + Gregorian calendar in Arabic (business convention for financial figures in KSA).
 * All dates are formatted in Asia/Riyadh so server and client output match.
 */
import type { Locale } from "@/i18n/constants";

const TZ = "Asia/Riyadh";
export const intlLocale = (l: Locale) => (l === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB");

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const k = locale + JSON.stringify(opts);
  let f = nfCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(intlLocale(locale), opts);
    nfCache.set(k, f);
  }
  return f;
}

export const currencyLabel = (l: Locale) => (l === "ar" ? "ر.س" : "SAR");

function withCurrency(l: Locale, n: string) {
  return l === "ar" ? `${n} ${currencyLabel(l)}` : `${currencyLabel(l)} ${n}`;
}

/** halalas → "SAR 1,250,000" (decimals only when there are halalas). */
export function formatMoney(halalas: number | null | undefined, locale: Locale): string {
  if (halalas === null || halalas === undefined) return "—";
  const sar = halalas / 100;
  const whole = Number.isInteger(sar);
  return withCurrency(locale, nf(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(sar));
}

/** halalas → "SAR 2.4M" */
export function formatMoneyCompact(halalas: number | null | undefined, locale: Locale): string {
  if (halalas === null || halalas === undefined) return "—";
  const sar = halalas / 100;
  return withCurrency(locale, nf(locale, { notation: "compact", maximumFractionDigits: sar >= 1e6 ? 2 : 1 }).format(sar));
}

export function formatNumber(n: number, locale: Locale, opts: Intl.NumberFormatOptions = {}): string {
  return nf(locale, opts).format(n);
}

export function formatPercent(ratio: number, locale: Locale): string {
  return nf(locale, { style: "percent", maximumFractionDigits: 0 }).format(ratio);
}

/** halalas → plain SAR string for form defaults ("1250000" or "1250.5"). */
export function halalasToSarInput(halalas: number | null | undefined): string {
  if (halalas === null || halalas === undefined) return "";
  return String(halalas / 100);
}

const dfCache = new Map<string, Intl.DateTimeFormat>();
function df(locale: Locale, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = locale + JSON.stringify(opts);
  let f = dfCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale(locale), opts);
    dfCache.set(k, f);
  }
  return f;
}

const isDateOnly = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);
const parse = (iso: string) => new Date(isDateOnly(iso) ? `${iso}T00:00:00Z` : iso);

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  return df(locale, { day: "numeric", month: "short", year: "numeric", timeZone: isDateOnly(iso) ? "UTC" : TZ }).format(parse(iso));
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  return df(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(parse(iso));
}

export function formatShortDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  return df(locale, { day: "numeric", month: "short", timeZone: isDateOnly(iso) ? "UTC" : TZ }).format(parse(iso));
}

/** 'YYYY-MM-01' → "March 2026" */
export function formatPeriod(period: string | null | undefined, locale: Locale): string {
  if (!period) return "—";
  return df(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(parse(period.slice(0, 10)));
}

export function formatPeriodShort(period: string, locale: Locale): string {
  return df(locale, { month: "short", timeZone: "UTC" }).format(parse(period.slice(0, 10)));
}

/** Whole days from `from` (default now) until `iso`; negative when past. */
export function daysUntil(iso: string, from: number = Date.now()): number {
  return Math.ceil((parse(iso).getTime() - from) / 86_400_000);
}

export function formatBytes(n: number, locale: Locale): string {
  if (n < 1024) return `${formatNumber(n, locale)} B`;
  if (n < 1024 * 1024) return `${formatNumber(n / 1024, locale, { maximumFractionDigits: 0 })} KB`;
  return `${formatNumber(n / 1024 / 1024, locale, { maximumFractionDigits: 1 })} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

/** Display name for a company in the current locale. */
export function companyName(c: { legalName: string; legalNameAr?: string | null }, locale: Locale): string {
  return locale === "ar" && c.legalNameAr ? c.legalNameAr : c.legalName;
}
