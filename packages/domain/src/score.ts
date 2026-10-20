/**
 * Buyer score engine (SPEC §5). Pure: the caller loads lines, snapshots and defaults; this decides everything.
 */
import { sha256Hex } from "./crypto";
import { PRIVACY_FLOOR } from "./rules";
import { addPeriods, DAY_MS, periodEnd, periodIndex } from "./time";
import type { Band, Behaviour, Confidence, FactorKey, Light, LineStatus, SnapshotInput, SuppressedReason } from "./types";

export const LOOKBACK_PERIODS = 12;
export const RECENCY_DECAY = 0.85;
export const FACTOR_WEIGHTS: Record<FactorKey, number> = { payment: 0.45, delinquency: 0.2, utilization: 0.2, trend: 0.15 };
export const FACTOR_ORDER: FactorKey[] = ["payment", "delinquency", "utilization", "trend"];
export const DELINQUENCY_BUCKET_WEIGHTS = { d1_30: 0.25, d31_60: 0.5, d61_90: 0.8, d90Plus: 1 } as const;
export const SCORE_MIN = 300;
export const SCORE_MAX = 1000;
export const CAPS = { unpaidDefault: 499, multipleDefaults: 399, recentDefault: 699, severeArrears: 599 } as const;
export type CapKey = keyof typeof CAPS;

/** One credit line to the buyer, as the release sees it. */
export interface ScoreLine {
  supplierId: string;
  status: LineStatus;
  suspended: boolean;
  closedAt: Date | null;
  /** Limit of the confirmed version in force, halalas. */
  confirmedLimit: number;
  /** Usable snapshots (quarantined / rejected already removed), any order. */
  snapshots: SnapshotInput[];
}

/** An ops-upheld default against the buyer (status UPHELD or SETTLED, on a non-voided line). */
export interface ScoreDefault {
  upheldAt: Date;
  /** Settlement confirmed by ops. */
  settled: boolean;
}

export interface Reason {
  key: string;
  params: Record<string, string | number>;
}

export interface FactorResult {
  key: FactorKey;
  /** 0–100, one decimal. */
  value: number;
  /** Effective weight after re-normalisation (0–1). */
  weight: number;
  reason: Reason;
}

export interface ScoreExplanation {
  factors: FactorResult[];
  caps: { key: string; cap: number }[];
  /** The "Bad-debt history" row. */
  defaultsReason: Reason;
  rawScore: number;
  utilization: number;
  onTimeRatio: number;
  periodsOfHistory: number;
  eligibleSuppliers: number;
  /** Upheld default not yet settled (drives the alert badge on the card). */
  activeAlert: boolean;
}

export interface ScoreValues {
  score: number;
  band: Band;
  light: Light;
  behaviour: Behaviour;
  confidence: Confidence;
  exposureBand: string;
  supplierBand: string;
  explanation: ScoreExplanation;
}

/** The company's row in the previous release. */
export interface PreviousRelease {
  published: boolean;
  cohortHash: string | null;
  values: ScoreValues | null;
}

export type ScoreOutcome =
  | { published: false; suppressedReason: SuppressedReason; supplierIds: string[] }
  | { published: true; frozen: boolean; values: ScoreValues; supplierIds: string[] };

/* ───────── Eligibility & privacy floor ───────── */

/** The line's snapshot for M, else M−1 (carried forward), else null (not current). */
export function latestSnapshot(line: Pick<ScoreLine, "snapshots">, period: string): SnapshotInput | null {
  const prev = addPeriods(period, -1);
  return line.snapshots.find((s) => s.period === period) ?? line.snapshots.find((s) => s.period === prev) ?? null;
}

/** ACTIVE, or CLOSED within 12 months of the period's end; not voided, not suspended; with a current snapshot. */
export function isEligibleLine(line: ScoreLine, period: string): boolean {
  if (line.suspended) return false;
  if (line.status === "CLOSED") {
    const asOf = periodEnd(period);
    const cutoff = new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), asOf.getUTCDate(), asOf.getUTCHours()));
    if (!line.closedAt || line.closedAt < cutoff) return false;
  } else if (line.status !== "ACTIVE") return false;
  return latestSnapshot(line, period) !== null;
}

export function eligibleLines(lines: ScoreLine[], period: string): ScoreLine[] {
  return lines.filter((l) => isEligibleLine(l, period));
}

/** Sorted distinct supplier ids of the eligible lines. */
export const eligibleSupplierIds = (lines: ScoreLine[], period: string): string[] =>
  [...new Set(eligibleLines(lines, period).map((l) => l.supplierId))].sort();

export const meetsPrivacyFloor = (supplierCount: number): boolean => supplierCount >= PRIVACY_FLOOR;

/* ───────── Bands ───────── */

export function bandOf(score: number): Band {
  if (score >= 800) return "EXCELLENT";
  if (score >= 700) return "GOOD";
  if (score >= 600) return "FAIR";
  return "POOR";
}

const SAR = 100;
const EXPOSURE_BANDS: [number, string][] = [
  [50_000 * SAR, "<50K"],
  [100_000 * SAR, "50K–100K"],
  [250_000 * SAR, "100K–250K"],
  [500_000 * SAR, "250K–500K"],
  [1_000_000 * SAR, "500K–1M"],
  [2_500_000 * SAR, "1M–2.5M"],
  [5_000_000 * SAR, "2.5M–5M"],
  [10_000_000 * SAR, "5M–10M"],
];
export function exposureBandOf(totalOutstanding: number): string {
  return EXPOSURE_BANDS.find(([max]) => totalOutstanding < max)?.[1] ?? "10M+";
}

export function supplierBandOf(count: number): string {
  if (count <= 4) return "3–4";
  if (count <= 10) return "5–10";
  if (count <= 20) return "11–20";
  return "21+";
}

export function behaviourOf(onTimeRatio: number): Behaviour {
  if (onTimeRatio >= 0.9) return "HIGH";
  if (onTimeRatio >= 0.7) return "MEDIUM";
  return "LOW";
}

export function confidenceOf(suppliers: number, periods: number): Confidence {
  if (suppliers >= 5 && periods >= 6) return "HIGH";
  if (suppliers >= 3 && periods >= 3) return "MEDIUM";
  return "LOW";
}

/* ───────── Factors ───────── */

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (ratio: number) => Math.round(ratio * 100);

interface PeriodTotals {
  outstanding: number;
  settledTotal: number;
  settledOnTime: number;
}

function totalsByPeriod(lines: ScoreLine[], period: string): Map<string, PeriodTotals> {
  const from = periodIndex(period) - (LOOKBACK_PERIODS - 1);
  const to = periodIndex(period);
  const map = new Map<string, PeriodTotals>();
  for (const line of lines) {
    for (const s of line.snapshots) {
      const idx = periodIndex(s.period);
      if (idx < from || idx > to) continue;
      const t = map.get(s.period) ?? { outstanding: 0, settledTotal: 0, settledOnTime: 0 };
      t.outstanding += s.outstanding;
      t.settledTotal += s.settledTotal;
      t.settledOnTime += s.settledOnTime;
      map.set(s.period, t);
    }
  }
  return map;
}

/** Recency-weighted on-time ratio (0–1), or null when nothing was settled in the lookback. */
export function paymentRatio(totals: Map<string, PeriodTotals>, period: string): number | null {
  let num = 0;
  let den = 0;
  for (const [p, t] of totals) {
    if (t.settledTotal <= 0) continue;
    const w = RECENCY_DECAY ** periodsAgo(p, period);
    num += w * (t.settledOnTime / t.settledTotal);
    den += w;
  }
  return den > 0 ? num / den : null;
}

const periodsAgo = (p: string, period: string) => periodIndex(period) - periodIndex(p);

function delinquencyShare(latest: SnapshotInput[]): number {
  const outstanding = latest.reduce((a, s) => a + s.outstanding, 0);
  if (outstanding <= 0) return 0;
  const w = DELINQUENCY_BUCKET_WEIGHTS;
  const late = latest.reduce((a, s) => a + w.d1_30 * s.d1_30 + w.d31_60 * s.d31_60 + w.d61_90 * s.d61_90 + w.d90Plus * s.d90Plus, 0);
  return late / outstanding;
}

/** Ratio of average outstanding in (M, M−1, M−2) to (M−3, M−4, M−5); null when a window is empty or the older one is zero. */
function trendRatio(totals: Map<string, PeriodTotals>, period: string): number | null {
  const avg = (ages: number[]) => {
    const vals = ages.map((a) => totals.get(addPeriods(period, -a))?.outstanding).filter((v): v is number => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const recent = avg([0, 1, 2]);
  const older = avg([3, 4, 5]);
  if (recent === null || older === null || older <= 0) return null;
  return recent / older;
}

function paymentReason(ratio: number): Reason {
  const key = ratio >= 0.9 ? "reasons.paymentStrong" : ratio >= 0.7 ? "reasons.paymentFair" : "reasons.paymentWeak";
  return { key, params: { pct: pct(ratio) } };
}
function delinquencyReason(share: number, overdueShare: number): Reason {
  if (overdueShare <= 0) return { key: "reasons.delinquencyNone", params: {} };
  return { key: share >= 0.25 ? "reasons.delinquencyHigh" : "reasons.delinquencySome", params: { pct: pct(overdueShare) } };
}
function utilizationReason(u: number): Reason {
  const key =
    u > 0.85 ? "reasons.utilizationCritical" : u >= 0.6 ? "reasons.utilizationHigh" : u > 0.5 ? "reasons.utilizationModerate" : "reasons.utilizationLow";
  return { key, params: { pct: pct(u) } };
}
function trendReason(r: number): Reason {
  const change = Math.round((r - 1) * 100);
  if (r <= 1) return { key: "reasons.trendStable", params: { pct: Math.abs(change) } };
  return { key: "reasons.trendRising", params: { pct: change } };
}

/* ───────── Caps ───────── */

export function applicableCaps(defaults: ScoreDefault[], asOf: Date, severeArrears: boolean): { key: CapKey; cap: number }[] {
  const within = (months: number) => {
    const cutoff = new Date(asOf.getTime() - months * 30.4375 * DAY_MS);
    return defaults.filter((d) => d.upheldAt >= cutoff && d.upheldAt <= asOf);
  };
  const last24 = within(24);
  const caps: { key: CapKey; cap: number }[] = [];
  if (defaults.some((d) => !d.settled && d.upheldAt <= asOf)) caps.push({ key: "unpaidDefault", cap: CAPS.unpaidDefault });
  if (last24.length >= 2) caps.push({ key: "multipleDefaults", cap: CAPS.multipleDefaults });
  if (last24.length >= 1) caps.push({ key: "recentDefault", cap: CAPS.recentDefault });
  if (severeArrears) caps.push({ key: "severeArrears", cap: CAPS.severeArrears });
  return caps;
}

const DEFAULT_REASON_KEYS: Record<Exclude<CapKey, "severeArrears">, string> = {
  unpaidDefault: "reasons.defaultsUnpaid",
  multipleDefaults: "reasons.defaultsMultiple",
  recentDefault: "reasons.defaultsRecent",
};

/** The "Bad-debt history" row: the lowest default cap, or none. */
function defaultsReason(caps: { key: CapKey; cap: number }[]): Reason {
  let lowest: { key: Exclude<CapKey, "severeArrears">; cap: number } | null = null;
  for (const c of caps) if (c.key !== "severeArrears" && (!lowest || c.cap < lowest.cap)) lowest = { key: c.key, cap: c.cap };
  return lowest ? { key: DEFAULT_REASON_KEYS[lowest.key], params: { cap: lowest.cap } } : { key: "reasons.defaultsNone", params: {} };
}

/** Cohort identity of a release: SHA-256 of the sorted eligible supplier ids. Stored, never shown. */
export const cohortHash = (sortedSupplierIds: string[]): Promise<string> => sha256Hex(sortedSupplierIds.join(","));

/* ───────── The engine ───────── */

export interface ScoreInput {
  /** Release month M ('YYYY-MM-01'). */
  period: string;
  lines: ScoreLine[];
  defaults: ScoreDefault[];
  previous: PreviousRelease | null;
  /** Hash of the sorted eligible supplier ids (see `cohortHash`), computed by the caller. */
  cohortHash: string;
}

/** Raw values for the current data, without the privacy floor or the cohort freeze. Null = no payment data. */
export function computeScoreValues(period: string, lines: ScoreLine[], defaults: ScoreDefault[]): ScoreValues | null {
  const eligible = eligibleLines(lines, period);
  const suppliers = new Set(eligible.map((l) => l.supplierId)).size;
  const totals = totalsByPeriod(eligible, period);
  const onTime = paymentRatio(totals, period);
  if (onTime === null) return null;

  const latest = eligible.map((l) => latestSnapshot(l, period)!);
  const outstanding = latest.reduce((a, s) => a + s.outstanding, 0);
  const limits = eligible.reduce((a, l) => a + l.confirmedLimit, 0);
  const u = limits > 0 ? outstanding / limits : 0;
  const share = delinquencyShare(latest);
  const overdue = latest.reduce((a, s) => a + s.d1_30 + s.d31_60 + s.d61_90 + s.d90Plus, 0);
  const d90 = latest.reduce((a, s) => a + s.d90Plus, 0);
  const r = trendRatio(totals, period);

  const raw: { key: FactorKey; value: number; reason: Reason }[] = [
    { key: "payment", value: 100 * onTime, reason: paymentReason(onTime) },
    {
      key: "delinquency",
      value: 100 * (1 - Math.min(1, share / 0.5)),
      reason: delinquencyReason(share, outstanding > 0 ? overdue / outstanding : 0),
    },
    { key: "utilization", value: u <= 0.5 ? 100 : Math.max(0, (100 * (1 - u)) / 0.5), reason: utilizationReason(u) },
  ];
  if (r !== null) raw.push({ key: "trend", value: r <= 1 ? 100 : Math.max(0, 100 * (2 - r)), reason: trendReason(r) });

  const weightSum = raw.reduce((a, f) => a + FACTOR_WEIGHTS[f.key], 0);
  const factors: FactorResult[] = raw.map((f) => ({
    key: f.key,
    value: round1(f.value),
    weight: Math.round((FACTOR_WEIGHTS[f.key] / weightSum) * 1000) / 1000,
    reason: f.reason,
  }));
  const weighted = raw.reduce((a, f) => a + f.value * (FACTOR_WEIGHTS[f.key] / weightSum), 0);
  const rawScore = SCORE_MIN + 7 * weighted;

  const asOf = periodEnd(period);
  const caps = applicableCaps(defaults, asOf, outstanding > 0 && d90 / outstanding > 0.25);
  // Rounded first, then capped, so a cap is never exceeded by rounding (499 stays 499, not 500).
  const capped = Math.min(Math.round(rawScore / 10) * 10, ...caps.map((c) => c.cap));
  const score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, capped));

  const unpaid = caps.some((c) => c.key === "unpaidDefault");
  const recentUpheld = defaults.some((d) => d.upheldAt <= asOf && asOf.getTime() - d.upheldAt.getTime() <= 365.25 * DAY_MS);
  const p = 100 * onTime;
  const light: Light = unpaid || u > 0.85 || p < 60 ? "RED" : u >= 0.6 || p < 80 || recentUpheld ? "YELLOW" : "GREEN";
  const periodsOfHistory = [...totals.values()].length;

  return {
    score,
    band: bandOf(score),
    light,
    behaviour: behaviourOf(onTime),
    confidence: confidenceOf(suppliers, periodsOfHistory),
    exposureBand: exposureBandOf(outstanding),
    supplierBand: supplierBandOf(suppliers),
    explanation: {
      factors,
      caps: caps.map((c) => ({ key: `caps.${c.key}`, cap: c.cap })),
      defaultsReason: defaultsReason(caps),
      rawScore: Math.round(rawScore * 10) / 10,
      utilization: Math.round(u * 1000) / 1000,
      onTimeRatio: Math.round(onTime * 1000) / 1000,
      periodsOfHistory,
      eligibleSuppliers: suppliers,
      activeAlert: unpaid,
    },
  };
}

/** Full release decision for one buyer: privacy floor, payment data, then the cohort freeze. */
export function scoreBuyer(input: ScoreInput): ScoreOutcome {
  const supplierIds = eligibleSupplierIds(input.lines, input.period);
  if (!meetsPrivacyFloor(supplierIds.length)) return { published: false, suppressedReason: "BELOW_FLOOR", supplierIds };
  const values = computeScoreValues(input.period, input.lines, input.defaults);
  if (!values) return { published: false, suppressedReason: "NO_PAYMENT_DATA", supplierIds };
  const prev = input.previous;
  if (prev?.published && prev.values && prev.cohortHash !== input.cohortHash) {
    return { published: true, frozen: true, values: prev.values, supplierIds };
  }
  return { published: true, frozen: false, values, supplierIds };
}
