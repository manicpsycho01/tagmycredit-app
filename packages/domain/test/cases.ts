/**
 * Score cases derived from docs/SPEC.md §5–6 BEFORE reading the implementation. Every expected number is
 * hand-computed in the comment next to it. Amounts are halalas. Release month M = 2026-02-01, run 2026-03-15.
 *
 * Formula recap (SPEC §5):
 *   payment P   = 100·Σ w·Q / Σ w, Q = on-time/settled per period (periods with settled = 0 skipped), w = 0.85^age
 *   delinquency = 100·(1 − min(1, share/0.5)), share = (.25·d1_30 + .5·d31_60 + .8·d61_90 + 1·d90+)/outstanding
 *                 over each line's latest snapshot (period M, else M−1 carried forward)
 *   quarantined snapshots are excluded from everything (SPEC §4)
 *   utilization = 100 if U ≤ .5; 100·(1 − U)/.5 for .5<U<1; 0 if U ≥ 1      (U = Σ outstanding_M / Σ limit)
 *   trend       = 100 if R ≤ 1, max(0, 100·(2 − R)) otherwise; R = avg out (M..M−2) / avg out (M−3..M−5)
 *   weights 45/20/20/15 re-normalised over present factors; raw = 300 + 7·weighted → caps → round 10 → clamp.
 */
import type { SnapshotInput } from "../src/index";

export const M = "2026-02-01";
export const NOW = "2026-03-15T09:00:00.000Z";
export const SAR = (sar: number) => Math.round(sar * 100);
const L = SAR(100_000); // 10,000,000 halalas limit per line

/** 'YYYY-MM-01' `age` months before M. */
export function periodAt(age: number, m = M): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const idx = y * 12 + (mo - 1) - age;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
}

export interface SnapSpec {
  outstanding: number;
  d1_30?: number;
  d31_60?: number;
  d61_90?: number;
  d90Plus?: number;
  settledTotal?: number;
  settledOnTime?: number;
}
export type CaseSnapshot = SnapshotInput & { quarantined?: boolean };
export function snap(age: number, s: SnapSpec & { quarantined?: boolean }): CaseSnapshot {
  const d1_30 = s.d1_30 ?? 0;
  const d31_60 = s.d31_60 ?? 0;
  const d61_90 = s.d61_90 ?? 0;
  const d90Plus = s.d90Plus ?? 0;
  const settledTotal = s.settledTotal ?? 500_000;
  return {
    period: periodAt(age),
    outstanding: s.outstanding,
    notDue: s.outstanding - d1_30 - d31_60 - d61_90 - d90Plus,
    d1_30,
    d31_60,
    d61_90,
    d90Plus,
    settledTotal,
    settledOnTime: s.settledOnTime ?? settledTotal,
    ...(s.quarantined ? { quarantined: true } : {}),
  };
}
/** Snapshots for ages 0..n−1. */
export const series = (n: number, f: (age: number) => SnapSpec) => Array.from({ length: n }, (_, age) => snap(age, f(age)));

export interface CaseLine {
  supplier: string;
  limit: number;
  status: "ACTIVE" | "CLOSED" | "VOIDED";
  closedAt?: string;
  suspended?: boolean;
  snapshots: CaseSnapshot[];
}
export interface CaseDefault {
  status: "UNDER_REVIEW" | "INFO_REQUESTED" | "UPHELD" | "REJECTED" | "RETRACTED" | "SETTLED";
  /** when ops decided (upheld) */
  decidedAt: string;
  settledAt?: string;
}
export interface ScoreExpect {
  published: boolean;
  suppressedReason?: "BELOW_FLOOR" | "NO_PAYMENT_DATA";
  score?: number;
  /** when caps make the exact rounding ambiguous (see HANDOFF bug "cap rounding") */
  scoreAtMost?: number;
  band?: "POOR" | "FAIR" | "GOOD" | "EXCELLENT";
  light?: "GREEN" | "YELLOW" | "RED";
  behaviour?: "HIGH" | "MEDIUM" | "LOW";
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  exposureBand?: string;
  supplierBand?: string;
  factors?: Partial<Record<"payment" | "delinquency" | "utilization" | "trend", number | null>>;
  caps?: number[];
}
export interface ScoreCase {
  name: string;
  lines: CaseLine[];
  defaults?: CaseDefault[];
  expect: ScoreExpect;
}

const active = (supplier: string, snapshots: CaseSnapshot[], limit = L): CaseLine => ({ supplier, limit, status: "ACTIVE", snapshots });
/** The same series on 3 (or n) suppliers. */
const trio = (snaps: CaseSnapshot[], n = 3) => Array.from({ length: n }, (_, i) => active(`S${i + 1}`, snaps));

export const flat = (outstanding: number) => series(6, () => ({ outstanding }));
const perfect = trio(flat(SAR(10_000)));

export const scoreCases: ScoreCase[] = [
  {
    // All factors 100 → weighted 100 → raw 1000. U = 30k/300k = 0.1. Exposure Σ 30,000 SAR. 3 suppliers, 6 periods.
    name: "perfect payer",
    lines: perfect,
    expect: {
      published: true, score: 1000, band: "EXCELLENT", light: "GREEN", behaviour: "HIGH", confidence: "MEDIUM",
      exposureBand: "<50K", supplierBand: "3–4", factors: { payment: 100, delinquency: 100, utilization: 100, trend: 100 }, caps: [],
    },
  },
  {
    // U = 0.75 → util = 100·0.25/0.5 = 50. weighted = (4500+2000+1000+1500)/100 = 90 → 930. U ≥ .60 → YELLOW. Σ 225,000 SAR.
    name: "utilization 0.75",
    lines: trio(flat(SAR(75_000))),
    expect: { published: true, score: 930, band: "EXCELLENT", light: "YELLOW", exposureBand: "100K–250K", factors: { utilization: 50 } },
  },
  {
    // U = 0.60 exactly → util 80. weighted = (4500+2000+1600+1500)/100 = 96 → 972 → 970. U ≥ .60 → YELLOW (edge).
    name: "utilization exactly 0.60 is YELLOW",
    lines: trio(flat(SAR(60_000))),
    expect: { published: true, score: 970, light: "YELLOW", factors: { utilization: 80 } },
  },
  {
    // U = 0.59 → util 82. weighted 96.4 → 974.8 → 970. GREEN.
    name: "utilization 0.59 is GREEN",
    lines: trio(flat(SAR(59_000))),
    expect: { published: true, score: 970, light: "GREEN", factors: { utilization: 82 } },
  },
  {
    // U = 0.50 → util 100 (ramp starts above 0.5). 1000, GREEN. Σ 150,000 SAR.
    name: "utilization exactly 0.50 is not penalised",
    lines: trio(flat(SAR(50_000))),
    expect: { published: true, score: 1000, light: "GREEN", exposureBand: "100K–250K", factors: { utilization: 100 } },
  },
  {
    // U = 0.85 → util 30. weighted 86 → 902 → 900. Not > .85 → YELLOW (edge).
    name: "utilization exactly 0.85 is YELLOW",
    lines: trio(flat(SAR(85_000))),
    expect: { published: true, score: 900, light: "YELLOW", factors: { utilization: 30 } },
  },
  {
    // U = 0.86 → util 28. weighted 85.6 → 899.2 → 900. > .85 → RED.
    name: "utilization 0.86 is RED",
    lines: trio(flat(SAR(86_000))),
    expect: { published: true, score: 900, light: "RED", factors: { utilization: 28 } },
  },
  {
    // U = 1.2 → util 0. weighted 80 → 860. RED. Σ 360,000 SAR.
    name: "utilization above 1",
    lines: trio(flat(SAR(120_000))),
    expect: { published: true, score: 860, light: "RED", exposureBand: "250K–500K", factors: { utilization: 0 } },
  },
  {
    // Latest d61_90 = 25% → weighted share .8·.25 = .2 → delinquency 100·(1 − .4) = 60.
    // weighted = (4500+1200+2000+1500)/100 = 92 → 944 → 940. No 90+ cap.
    name: "delinquency: 61–90 bucket weighted 0.8",
    lines: trio(series(6, (age) => (age === 0 ? { outstanding: SAR(10_000), d61_90: SAR(2_500) } : { outstanding: SAR(10_000) }))),
    expect: { published: true, score: 940, light: "GREEN", factors: { delinquency: 60 }, caps: [] },
  },
  {
    // Buckets 1–30 = 20%, 31–60 = 20%: share = .25·.2 + .5·.2 = .15 → 100·(1 − .3) = 70.
    // weighted = (4500+1400+2000+1500)/100 = 94 → 958 → 960.
    name: "delinquency: 1–30 weighted 0.25 and 31–60 weighted 0.5",
    lines: trio(series(6, (age) => (age === 0 ? { outstanding: SAR(10_000), d1_30: SAR(2_000), d31_60: SAR(2_000) } : { outstanding: SAR(10_000) }))),
    expect: { published: true, score: 960, factors: { delinquency: 70 }, caps: [] },
  },
  {
    // 90+ exactly 25% → share .25 → delinquency 50 → weighted 90 → 930; cap needs MORE than 25% → no cap.
    name: "90+ exactly 25% → no cap",
    lines: trio(series(6, (age) => (age === 0 ? { outstanding: SAR(10_000), d90Plus: SAR(2_500) } : { outstanding: SAR(10_000) }))),
    expect: { published: true, score: 930, factors: { delinquency: 50 }, caps: [] },
  },
  {
    // 90+ = 30% → share .3 → delinquency 40, weighted 88 → raw 916 → cap 599 → POOR. Light: P 100, U .1 → GREEN.
    name: "90+ above 25% → cap 599",
    lines: trio(series(6, (age) => (age === 0 ? { outstanding: SAR(10_000), d90Plus: SAR(3_000) } : { outstanding: SAR(10_000) }))),
    expect: { published: true, scoreAtMost: 599, band: "POOR", light: "GREEN", factors: { delinquency: 40 }, caps: [599] },
  },
  {
    // d61_90 70% → share .56 ≥ .5 → delinquency 0. weighted 80 → 860.
    name: "delinquency reaches 0 at weighted share ≥ 50%",
    lines: trio(series(6, (age) => (age === 0 ? { outstanding: SAR(10_000), d61_90: SAR(7_000) } : { outstanding: SAR(10_000) }))),
    expect: { published: true, score: 860, factors: { delinquency: 0 } },
  },
  {
    // S3 has no period-M snapshot: its M−1 snapshot (100 % 90+) is carried forward as its latest.
    // Latest Σ outstanding 30k, 90+ 10k → share .3333 → delinquency 33.333; 90+ 33 % > 25 % → cap 599.
    name: "per-line latest snapshot carries M−1 forward",
    lines: [
      ...trio(flat(SAR(10_000)), 2),
      active("S3", series(6, (age) => (age === 1 ? { outstanding: SAR(10_000), d90Plus: SAR(10_000) } : { outstanding: SAR(10_000) })).slice(1)),
    ],
    expect: { published: true, scoreAtMost: 599, band: "POOR", factors: { delinquency: 33.3333 }, caps: [599] },
  },
  {
    // 3 periods, Q(age0..2) = .6, .9, 1.0. Σw = 1 + .85 + .7225 = 2.5725; ΣwQ = .6 + .765 + .7225 = 2.0875
    // P = 81.1467. Trend excluded (no M−3..M−5) → weights 45/20/20 of 85.
    // weighted = (45·81.1467 + 2000 + 2000)/85 = 90.0188 → raw 930.13 → 930. P ≥ 80 → GREEN. Behaviour 81 % → MEDIUM.
    name: "recency weights 0.85^age, trend excluded and re-normalised",
    lines: trio(series(3, (age) => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000), settledOnTime: SAR([6_000, 9_000, 10_000][age]!) }))),
    expect: {
      published: true, score: 930, light: "GREEN", behaviour: "MEDIUM", confidence: "MEDIUM",
      factors: { payment: 81.1467, delinquency: 100, utilization: 100, trend: null },
    },
  },
  {
    // age0 settled 0 → skipped; age1 Q .5 (w .85), age2 Q 1 (w .7225): P = 100·1.1475/1.5725 = 72.973.
    // weighted = (45·72.973 + 4000)/85 = 85.6915 → 899.84 → 900. P < 80 → YELLOW. Behaviour 73 % → MEDIUM.
    name: "payment skips months with nothing settled",
    lines: trio(series(3, (age) => ({ outstanding: SAR(10_000), settledTotal: [0, SAR(10_000), SAR(10_000)][age]!, settledOnTime: [0, SAR(5_000), SAR(10_000)][age]! }))),
    expect: { published: true, score: 900, light: "YELLOW", behaviour: "MEDIUM", factors: { payment: 72.973, trend: null } },
  },
  {
    // Payment pooled across lines: per period Σ on-time / Σ settled. S1 on time 0 of 10k, S2+S3 10k of 10k → Q = 2/3
    // each period → P = 66.667. Trend excluded (3 periods). weighted = (45·66.667+4000)/85 = 82.353 → 876.5 → 880.
    // P < 80 → YELLOW; behaviour 66.7 % → LOW.
    name: "payment aggregates across lines per period",
    lines: [
      active("S1", series(3, () => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000), settledOnTime: 0 }))),
      active("S2", series(3, () => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000) }))),
      active("S3", series(3, () => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000) }))),
    ],
    expect: { published: true, score: 880, light: "YELLOW", behaviour: "LOW", factors: { payment: 66.6667 } },
  },
  {
    // P = 59 (Q .59 every period) → RED light (P < 60). 3 periods → no trend.
    // weighted = (45·59 + 4000)/85 = 78.294 → 848.06 → 850.
    name: "payment 59 is RED",
    lines: trio(series(3, () => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000), settledOnTime: SAR(5_900) }))),
    expect: { published: true, score: 850, light: "RED", behaviour: "LOW", factors: { payment: 59 } },
  },
  {
    // P = 60 exactly → not RED; < 80 → YELLOW. weighted (2700+4000)/85 = 78.824 → 851.76 → 850.
    name: "payment exactly 60 is YELLOW",
    lines: trio(series(3, () => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000), settledOnTime: SAR(6_000) }))),
    expect: { published: true, score: 850, light: "YELLOW", behaviour: "LOW", factors: { payment: 60 } },
  },
  {
    // P = 80 exactly → GREEN. Behaviour 80 % → MEDIUM. weighted (3600+4000)/85 = 89.412 → 925.9 → 930.
    name: "payment exactly 80 is GREEN",
    lines: trio(series(3, () => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000), settledOnTime: SAR(8_000) }))),
    expect: { published: true, score: 930, light: "GREEN", behaviour: "MEDIUM", factors: { payment: 80 } },
  },
  {
    // Behaviour 90 % → HIGH (edge). P 90: weighted (4050+4000)/85 = 94.706 → 962.9 → 960.
    name: "on-time 90% is HIGH behaviour",
    lines: trio(series(3, () => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000), settledOnTime: SAR(9_000) }))),
    expect: { published: true, score: 960, behaviour: "HIGH", light: "GREEN" },
  },
  {
    // Behaviour 70 % → MEDIUM (edge). P 70 → YELLOW. weighted (3150+4000)/85 = 84.118 → 888.8 → 890.
    name: "on-time 70% is MEDIUM behaviour",
    lines: trio(series(3, () => ({ outstanding: SAR(10_000), settledTotal: SAR(10_000), settledOnTime: SAR(7_000) }))),
    expect: { published: true, score: 890, behaviour: "MEDIUM", light: "YELLOW" },
  },
  {
    // R = avg(16k)/avg(10k) = 1.6 → trend 40. U = .16. weighted (4500+2000+2000+600)/100 = 91 → 937 → 940.
    name: "exposure trend R = 1.6",
    lines: trio(series(6, (age) => ({ outstanding: age < 3 ? SAR(16_000) : SAR(10_000) }))),
    expect: { published: true, score: 940, light: "GREEN", factors: { trend: 40 } },
  },
  {
    // R = 2.5 → trend max(0, 100·(2 − 2.5)) = 0.
    name: "exposure trend R ≥ 2 → 0",
    lines: trio(series(6, (age) => ({ outstanding: age < 3 ? SAR(25_000) : SAR(10_000) }))),
    expect: { published: true, factors: { trend: 0 } },
  },
  {
    // Shrinking exposure R = .5 → 100 → 1000.
    name: "exposure trend shrinking",
    lines: trio(series(6, (age) => ({ outstanding: age < 3 ? SAR(10_000) : SAR(20_000) }))),
    expect: { published: true, score: 1000, factors: { trend: 100 } },
  },
  {
    // Only M and M−3 present: R = 12k/10k = 1.2 → trend 80. weighted (4500+2000+2000+1200)/100 = 97 → 979 → 980.
    name: "trend needs only one period in each window",
    lines: trio([snap(0, { outstanding: SAR(12_000) }), snap(3, { outstanding: SAR(10_000) })]),
    expect: { published: true, score: 980, factors: { trend: 80 } },
  },
  {
    // Every factor 0: P 0 (nothing on time), d61_90 = 100 % at M (share .8 ≥ .5), U = 1.1, R = 2.2 → weighted 0 → 300. RED, LOW, POOR.
    name: "floor of the scale: 300",
    lines: trio(series(6, (age) => (age < 3
      ? { outstanding: SAR(110_000), d61_90: age === 0 ? SAR(110_000) : 0, settledTotal: SAR(1_000), settledOnTime: 0 }
      : { outstanding: SAR(50_000), settledTotal: SAR(1_000), settledOnTime: 0 }))),
    expect: { published: true, score: 300, band: "POOR", light: "RED", behaviour: "LOW", factors: { payment: 0, delinquency: 0, utilization: 0, trend: 0 } },
  },

  /* ── privacy floor & eligibility ── */
  { name: "2 suppliers → suppressed", lines: trio(flat(SAR(10_000)), 2), expect: { published: false, suppressedReason: "BELOW_FLOOR" } },
  {
    name: "third supplier's latest snapshot is M−2 → not fresh → suppressed",
    lines: [...trio(flat(SAR(10_000)), 2), active("S3", series(6, () => ({ outstanding: SAR(10_000) })).slice(2))],
    expect: { published: false, suppressedReason: "BELOW_FLOOR" },
  },
  {
    name: "third supplier's latest snapshot is M−1 → fresh → published",
    lines: [...trio(flat(SAR(10_000)), 2), active("S3", series(6, () => ({ outstanding: SAR(10_000) })).slice(1))],
    expect: { published: true },
  },
  {
    name: "voided line does not count toward the floor",
    lines: [...trio(flat(SAR(10_000)), 2), { ...active("S3", flat(SAR(10_000))), status: "VOIDED" }],
    expect: { published: false, suppressedReason: "BELOW_FLOOR" },
  },
  {
    name: "suspended line does not count toward the floor",
    lines: [...trio(flat(SAR(10_000)), 2), { ...active("S3", flat(SAR(10_000))), suspended: true }],
    expect: { published: false, suppressedReason: "BELOW_FLOOR" },
  },
  {
    name: "line closed 2 months ago with an M−1 snapshot still counts",
    lines: [...trio(flat(SAR(10_000)), 2), { ...active("S3", flat(SAR(10_000)).slice(1)), status: "CLOSED", closedAt: "2026-01-10T00:00:00.000Z" }],
    expect: { published: true },
  },
  {
    name: "line closed 13 months ago does not count",
    lines: [...trio(flat(SAR(10_000)), 2), { ...active("S3", flat(SAR(10_000)).slice(1)), status: "CLOSED", closedAt: "2025-02-10T00:00:00.000Z" }],
    expect: { published: false, suppressedReason: "BELOW_FLOOR" },
  },
  {
    name: "two lines from the same supplier count once",
    lines: [
      active("S1", flat(SAR(10_000))),
      { ...active("S1", flat(SAR(10_000)).slice(1)), status: "CLOSED", closedAt: "2026-01-20T00:00:00.000Z" },
      active("S2", flat(SAR(10_000))),
    ],
    expect: { published: false, suppressedReason: "BELOW_FLOOR" },
  },
  {
    // The voided line's awful data must not leak into any factor → identical to "perfect payer".
    name: "voided line excluded from all calculations",
    lines: [...perfect, { ...active("S4", series(6, () => ({ outstanding: SAR(100_000), d90Plus: SAR(100_000), settledTotal: SAR(1_000), settledOnTime: 0 }))), status: "VOIDED" }],
    expect: { published: true, score: 1000, light: "GREEN", supplierBand: "3–4", caps: [] },
  },
  {
    // A quarantined period-M snapshot (awful data) is ignored; S1 falls back to M−1 → same as the perfect payer.
    name: "quarantined snapshot excluded from scoring",
    lines: [
      active("S1", [snap(0, { outstanding: SAR(10_000), d90Plus: SAR(10_000), settledTotal: SAR(1_000), settledOnTime: 0, quarantined: true }), ...flat(SAR(10_000)).slice(1)]),
      ...trio(flat(SAR(10_000)), 2).map((l, i) => ({ ...l, supplier: `S${i + 2}` })),
    ],
    expect: { published: true, score: 1000, caps: [] },
  },
  {
    // S3's M and M−1 snapshots are both quarantined → S3 has no current latest snapshot → only 2 eligible.
    name: "supplier whose recent snapshots are quarantined is not eligible",
    lines: [
      ...trio(flat(SAR(10_000)), 2),
      active("S3", flat(SAR(10_000)).map((sn, age) => (age < 2 ? { ...sn, quarantined: true } : sn))),
    ],
    expect: { published: false, suppressedReason: "BELOW_FLOOR" },
  },
  {
    name: "nothing settled in 12 months → NO_PAYMENT_DATA",
    lines: trio(series(6, () => ({ outstanding: SAR(10_000), settledTotal: 0, settledOnTime: 0 }))),
    expect: { published: false, suppressedReason: "NO_PAYMENT_DATA" },
  },
  {
    // 5 suppliers, 6 periods → HIGH confidence; supplier band 5–10. Σ 50,000 SAR → 50K–100K (lower edge inclusive).
    name: "5 suppliers × 6 periods → HIGH confidence",
    lines: trio(flat(SAR(10_000)), 5),
    expect: { published: true, confidence: "HIGH", supplierBand: "5–10", exposureBand: "50K–100K" },
  },
  {
    // 5 suppliers but only 5 periods → MEDIUM.
    name: "5 suppliers × 5 periods → MEDIUM confidence",
    lines: trio(series(5, () => ({ outstanding: SAR(10_000) })), 5),
    expect: { published: true, confidence: "MEDIUM" },
  },
  {
    // 3 suppliers × 2 periods → LOW.
    name: "3 suppliers × 2 periods → LOW confidence",
    lines: trio(series(2, () => ({ outstanding: SAR(10_000) }))),
    expect: { published: true, confidence: "LOW" },
  },
  {
    // Snapshots older than 12 periods are ignored: age 12 has terrible payment, ages 0–5 perfect → P 100.
    name: "lookback is 12 periods",
    lines: trio([...flat(SAR(10_000)), snap(12, { outstanding: SAR(10_000), settledTotal: SAR(10_000), settledOnTime: 0 })]),
    expect: { published: true, score: 1000, factors: { payment: 100 } },
  },
  {
    // Snapshots after M are ignored (release for M uses period ≤ M): a terrible M+1 snapshot changes nothing.
    name: "periods after M are ignored",
    lines: trio([snap(-1, { outstanding: SAR(100_000), d90Plus: SAR(100_000), settledTotal: SAR(1_000), settledOnTime: 0 }), ...flat(SAR(10_000))]),
    expect: { published: true, score: 1000, caps: [] },
  },
];

/* ── default caps on top of the perfect payer (raw 1000) ── */
const upheld = (decidedAt: string, settledAt?: string): CaseDefault => ({ status: settledAt ? "SETTLED" : "UPHELD", decidedAt, ...(settledAt ? { settledAt } : {}) });
const p90 = trio(series(6, (age) => (age === 0 ? { outstanding: SAR(10_000), d90Plus: SAR(3_000) } : { outstanding: SAR(10_000) })));

export const capCases: ScoreCase[] = [
  { name: "unpaid upheld default → ≤ 499, RED", lines: perfect, defaults: [upheld("2026-01-05T00:00:00Z")], expect: { published: true, scoreAtMost: 499, band: "POOR", light: "RED", caps: [499] } },
  { name: "settled upheld default 6 months ago → ≤ 699 (FAIR), YELLOW (upheld < 12 months)", lines: perfect, defaults: [upheld("2025-09-01T00:00:00Z", "2025-10-01T00:00:00Z")], expect: { published: true, scoreAtMost: 699, band: "FAIR", light: "YELLOW", caps: [699] } },
  { name: "settled upheld default 13 months ago → ≤ 699, GREEN", lines: perfect, defaults: [upheld("2025-02-01T00:00:00Z", "2025-03-01T00:00:00Z")], expect: { published: true, scoreAtMost: 699, band: "FAIR", light: "GREEN", caps: [699] } },
  { name: "settled upheld default 25 months ago → no cap", lines: perfect, defaults: [upheld("2024-02-01T00:00:00Z", "2024-03-01T00:00:00Z")], expect: { published: true, score: 1000, band: "EXCELLENT", light: "GREEN", caps: [] } },
  { name: "two upheld defaults in 24 months → ≤ 399", lines: perfect, defaults: [upheld("2025-12-01T00:00:00Z", "2026-01-01T00:00:00Z"), upheld("2024-07-01T00:00:00Z", "2024-08-01T00:00:00Z")], expect: { published: true, scoreAtMost: 399, band: "POOR", light: "YELLOW" } },
  { name: "unpaid + 90+ > 25% → lowest cap 499", lines: p90, defaults: [upheld("2026-01-05T00:00:00Z")], expect: { published: true, scoreAtMost: 499, band: "POOR", light: "RED" } },
  { name: "unpaid + a second upheld → lowest cap 399", lines: perfect, defaults: [upheld("2026-01-05T00:00:00Z"), upheld("2025-05-01T00:00:00Z", "2025-06-01T00:00:00Z")], expect: { published: true, scoreAtMost: 399, band: "POOR", light: "RED" } },
  { name: "settled upheld + 90+ > 25% → 599 beats 699", lines: p90, defaults: [upheld("2025-06-01T00:00:00Z", "2025-07-01T00:00:00Z")], expect: { published: true, scoreAtMost: 599, band: "POOR" } },
  ...(["UNDER_REVIEW", "INFO_REQUESTED", "REJECTED", "RETRACTED"] as const).map((status) => ({
    name: `${status} default never moves the score`,
    lines: perfect,
    defaults: [{ status, decidedAt: "2026-01-05T00:00:00Z" }],
    expect: { published: true, score: 1000, light: "GREEN" as const, caps: [] },
  })),
  { name: "upheld default on a buyer below the floor is still suppressed", lines: trio(flat(SAR(10_000)), 2), defaults: [upheld("2026-01-05T00:00:00Z")], expect: { published: false, suppressedReason: "BELOW_FLOOR" } },
];

/* ── pure lookups ── */
export const bandEdges: [number, string][] = [[300, "POOR"], [599, "POOR"], [600, "FAIR"], [699, "FAIR"], [700, "GOOD"], [799, "GOOD"], [800, "EXCELLENT"], [1000, "EXCELLENT"]];
/** [Σ outstanding SAR, band] — lower edge inclusive. */
export const exposureEdges: [number, string][] = [
  [0, "<50K"], [49_999.99, "<50K"], [50_000, "50K–100K"], [99_999.99, "50K–100K"], [100_000, "100K–250K"], [250_000, "250K–500K"],
  [500_000, "500K–1M"], [1_000_000, "1M–2.5M"], [2_500_000, "2.5M–5M"], [5_000_000, "5M–10M"], [9_999_999.99, "5M–10M"], [10_000_000, "10M+"], [1e9, "10M+"],
];
export const supplierEdges: [number, string][] = [[3, "3–4"], [4, "3–4"], [5, "5–10"], [10, "5–10"], [11, "11–20"], [20, "11–20"], [21, "21+"], [150, "21+"]];
export const confidenceCases: [number, number, string][] = [[5, 6, "HIGH"], [20, 12, "HIGH"], [5, 5, "MEDIUM"], [4, 12, "MEDIUM"], [3, 3, "MEDIUM"], [3, 2, "LOW"], [10, 1, "LOW"]];
/** [P, U, unpaidUpheld, upheldWithin12m, light] */
export const lightCases: [number, number, boolean, boolean, string][] = [
  [100, 0.1, false, false, "GREEN"], [100, 0.5999, false, false, "GREEN"], [100, 0.6, false, false, "YELLOW"], [100, 0.85, false, false, "YELLOW"],
  [100, 0.8501, false, false, "RED"], [80, 0.1, false, false, "GREEN"], [79.99, 0.1, false, false, "YELLOW"], [60, 0.1, false, false, "YELLOW"],
  [59.99, 0.1, false, false, "RED"], [100, 0.1, true, true, "RED"], [100, 0.1, false, true, "YELLOW"], [59, 0.7, false, true, "RED"],
];
/** [on-time ratio 0–1, behaviour] */
export const behaviourEdges: [number, string][] = [[1, "HIGH"], [0.9, "HIGH"], [0.8999, "MEDIUM"], [0.7, "MEDIUM"], [0.6999, "LOW"], [0, "LOW"]];
/** [weighted factor 0–100, raw before caps, rounded score] */
export const rawToScore: [number, number][] = [[0, 300], [100, 1000], [85.6915, 900], [90.0188, 930], [96.4, 970], [86, 900], [50, 650], [42.85, 600], [42.8, 600], [41.4, 590]];
/** SAR form input → halalas */
export const money: [string | number, number][] = [[0.29, 29], [19.99, 1999], [0.1 + 0.2, 30], [1234567.89, 123456789], [500_000_000, 50_000_000_000], [10_000, 1_000_000], ["1234.56", 123456], ["10000", 1_000_000]];

/** SPEC §4 quarantine: [previous snapshot (or null), current snapshot, confirmed limit, expected reason | null]. 31+ = d31_60 + d61_90 + d90+. */
export const quarantineCases: [SnapSpec | null, SnapSpec, number, string | null, string][] = [
  [{ outstanding: SAR(10_000) }, { outstanding: SAR(10_000), d31_60: SAR(4_000) }, L, null, "31+ share rises exactly 40 pp → not quarantined"],
  [{ outstanding: SAR(10_000) }, { outstanding: SAR(10_000), d31_60: SAR(4_100) }, L, "OVERDUE_JUMP", "31+ share rises 41 pp"],
  [{ outstanding: SAR(10_000), d90Plus: SAR(1_000) }, { outstanding: SAR(10_000), d61_90: SAR(3_000), d90Plus: SAR(2_600) }, L, "OVERDUE_JUMP", "10 % → 56 %"],
  [{ outstanding: SAR(10_000) }, { outstanding: SAR(10_000), d1_30: SAR(9_000) }, L, null, "1–30 days late does not count toward the jump"],
  [{ outstanding: SAR(10_000), d90Plus: SAR(6_000) }, { outstanding: SAR(10_000), d90Plus: SAR(10_000) }, L, null, "60 % → 100 % is +40 pp"],
  [{ outstanding: SAR(10_000) }, { outstanding: SAR(150_000) }, L, null, "outstanding exactly 150 % of limit"],
  [{ outstanding: SAR(10_000) }, { outstanding: SAR(150_000) + 1 }, L, "OVER_LIMIT", "outstanding just above 150 % of limit"],
  [null, { outstanding: SAR(10_000), d90Plus: SAR(9_000) }, L, null, "first snapshot has no previous to jump from"],
];
