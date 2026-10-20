/** Money is integer halalas (SAR × 100) everywhere; convert only at form edges. */

const SAR_RE = /^(\d{1,15})(?:\.(\d{1,2}))?$/;

/**
 * Parse a SAR amount typed by a person ("12500", "12,500.5", "12500.50") into halalas, without float maths.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function parseSar(input: string | number): number | null {
  const text = (typeof input === "number" ? String(input) : input).trim().replace(/[,\s٬]/g, "");
  const m = SAR_RE.exec(text);
  if (!m) return null;
  const halalas = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(halalas) ? halalas : null;
}

/** Whole halalas → SAR number (for inputs and charts; never store the result). */
export const halalasToSar = (halalas: number): number => halalas / 100;

export interface FormatSarOptions {
  locale?: "en" | "ar";
  /** 1.2M style. */
  compact?: boolean;
  /** Show halalas (2 decimals). Default false: whole riyals. */
  decimals?: boolean;
  /** Prefix with the currency code. Default true. */
  currency?: boolean;
}

/** Human display of a halalas amount, e.g. "SAR 1,250,000" or "SAR 1.3M". */
export function formatSar(halalas: number, opts: FormatSarOptions = {}): string {
  const { locale = "en", compact = false, decimals = false, currency = true } = opts;
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: decimals && !compact ? 2 : 0,
    maximumFractionDigits: compact ? 1 : decimals ? 2 : 0,
  });
  const value = nf.format(halalas / 100);
  if (!currency) return value;
  return locale === "ar" ? `${value} ر.س` : `SAR ${value}`;
}
