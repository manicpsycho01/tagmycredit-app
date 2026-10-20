/**
 * Business calendar helpers. TagMyCredit runs on the Riyadh calendar (UTC+3, no daylight saving): periods, due
 * dates and release days are Riyadh dates. All functions are pure and take `now` explicitly.
 */
import { RELEASE_DAY, SNAPSHOT_DUE_DAY } from "./rules";

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const addMinutes = (d: Date, n: number): Date => new Date(d.getTime() + n * MINUTE_MS);
export const addHours = (d: Date, n: number): Date => new Date(d.getTime() + n * HOUR_MS);
export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** The Riyadh calendar date of an instant. */
export function riyadhDate(now: Date): { year: number; month: number; day: number } {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Riyadh calendar date as 'YYYY-MM-DD'. */
export function riyadhIsoDate(now: Date): string {
  const { year, month, day } = riyadhDate(now);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Midnight (start of day) in Riyadh of a 'YYYY-MM-DD' date, as an instant. */
export function riyadhMidnight(isoDate: string): Date {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) - RIYADH_OFFSET_MS);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict 'YYYY-MM-DD' calendar date check. */
export function isIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** A period is a month, written as its first day: 'YYYY-MM-01'. */
export function isPeriod(s: string): boolean {
  return isIsoDate(s) && s.endsWith("-01");
}

/** Month index (year·12 + month−1) of a period, for arithmetic. */
export function periodIndex(period: string): number {
  return Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;
}

function periodFromIndex(idx: number): string {
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-01`;
}

export const addPeriods = (period: string, n: number): string => periodFromIndex(periodIndex(period) + n);

/** Whole months from `from` to `to` (positive when `to` is later). */
export const periodsBetween = (from: string, to: string): number => periodIndex(to) - periodIndex(from);

/** The month (period) containing an instant, on the Riyadh calendar. */
export function periodOf(now: Date): string {
  const { year, month } = riyadhDate(now);
  return `${year}-${pad(month)}-01`;
}

/** The period of a 'YYYY-MM-DD' calendar date. */
export const periodOfDate = (isoDate: string): string => `${isoDate.slice(0, 7)}-01`;

/** The month suppliers are reporting now: the last completed month. */
export const reportingPeriod = (now: Date): string => addPeriods(periodOf(now), -1);

/** Calendar due date ('YYYY-MM-DD') of a period's snapshot: the 10th of the following month. */
export const snapshotDueDate = (period: string): string => `${addPeriods(period, 1).slice(0, 8)}${pad(SNAPSHOT_DUE_DAY)}`;

/** Instant a period's snapshot becomes overdue: end of its due date in Riyadh. */
export const snapshotDueAt = (period: string): Date => addDays(riyadhMidnight(snapshotDueDate(period)), 1);

/** Instant the scheduled release for a period happens: 15th of the following month, 00:00 Riyadh. */
export const releaseAt = (period: string): Date =>
  riyadhMidnight(`${addPeriods(period, 1).slice(0, 8)}${pad(RELEASE_DAY)}`);

/** Period that the scheduled monthly release covers as of `now` (null before the 15th: last month's release is not due yet). */
export function scheduledReleasePeriod(now: Date): string | null {
  return riyadhDate(now).day >= RELEASE_DAY ? reportingPeriod(now) : null;
}

/** Most recent completed month — what "run now" scores. */
export const latestCompletedPeriod = reportingPeriod;

/** First instant of the month after a period (the "as of" moment of a release). */
export const periodEnd = (period: string): Date => riyadhMidnight(addPeriods(period, 1));

/** Whole days from `from` to `to`, rounded down. */
export const daysBetween = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / DAY_MS);
