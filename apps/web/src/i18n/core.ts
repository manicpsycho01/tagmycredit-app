/** Pure translator factory. Takes a messages object, so it never pulls dictionaries into client bundles. */
import type { MessageKey } from "./en";
import type { Locale } from "./constants";

export type { Locale, MessageKey };
export { LOCALES, LOCALE_COOKIE, THEME_COOKIE, isLocale, dirOf } from "./constants";

export type Params = Record<string, string | number | null | undefined>;
export type Messages = Record<MessageKey, string>;

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    return v === undefined || v === null ? m : String(v);
  });
}

/** Turns an unknown key like "errors.lineNotFound" into "Line not found" so a missing translation never shows a raw key. */
function humanize(key: string): string {
  const last = key.split(".").pop() ?? key;
  const spaced = last.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Server params carry months as 'YYYY-MM-01'; show them as "September 2026". */
const PERIOD = /^\d{4}-\d{2}-01$/;
function withReadablePeriod(params: Params | undefined, locale: Locale): Params | undefined {
  if (!params || typeof params.period !== "string" || !PERIOD.test(params.period)) return params;
  const [y, m] = params.period.split("-").map(Number);
  const label = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
  return { ...params, period: label };
}

export interface Translator {
  locale: Locale;
  /** Typed key lookup. */
  (key: MessageKey, params?: Params): string;
  /** Dynamic key from the server (errors.*, tasks.*, notifications.*, reasons.*, caps.*). */
  dyn(key: string, params?: Params): string;
  has(key: string): boolean;
}

export function makeT(locale: Locale, messages: Messages): Translator {
  const has = (key: string): key is MessageKey => Object.prototype.hasOwnProperty.call(messages, key);
  const t = ((key: MessageKey, params?: Params) => interpolate(messages[key] ?? key, params)) as Translator;
  t.locale = locale;
  t.has = has;
  t.dyn = (key: string, rawParams?: Params) => {
    const params = withReadablePeriod(rawParams, locale);
    if (has(key)) return interpolate(messages[key], params);
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing key: ${key}`);
    return interpolate(humanize(key), params);
  };
  return t;
}
