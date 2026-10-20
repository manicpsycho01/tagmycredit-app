/** SPEC §5 score: hand-computed cases from ./cases.ts, run black-box through scoreBuyer(). */
import { describe, expect, it } from "vitest";
import * as D from "../src/index";
import { bandEdges, behaviourEdges, capCases, confidenceCases, exposureEdges, M, SAR, scoreCases, supplierEdges, type ScoreCase, type ScoreExpect, flat } from "./cases";

function toInput(c: ScoreCase, previous: D.PreviousRelease | null = null, cohortHash = "h"): D.ScoreInput {
  return {
    period: M,
    lines: c.lines.map((l) => ({
      supplierId: l.supplier,
      status: l.status,
      suspended: l.suspended ?? false,
      closedAt: l.closedAt ? new Date(l.closedAt) : null,
      confirmedLimit: l.limit,
      // the release service removes quarantined / rejected snapshots before scoring (ScoreLine contract)
      snapshots: l.snapshots.filter((s) => !s.quarantined).map(({ quarantined: _q, ...s }) => s),
    })),
    // only UPHELD / SETTLED reports reach the score (ScoreDefault contract); others are checked in integration tests
    defaults: (c.defaults ?? [])
      .filter((d) => d.status === "UPHELD" || d.status === "SETTLED")
      .map((d) => ({ upheldAt: new Date(d.decidedAt), settled: d.status === "SETTLED" })),
    previous,
    cohortHash,
  };
}

function check(out: D.ScoreOutcome, e: ScoreExpect) {
  expect(out.published).toBe(e.published);
  if (!out.published) {
    if (e.suppressedReason) expect(out.suppressedReason).toBe(e.suppressedReason);
    expect(out).not.toHaveProperty("values");
    return;
  }
  const v = out.values;
  if (e.score !== undefined) expect(v.score, "score").toBe(e.score);
  if (e.scoreAtMost !== undefined) expect(v.score, "score ≤ cap").toBeLessThanOrEqual(e.scoreAtMost);
  expect(v.score % 10 === 0 || e.scoreAtMost !== undefined, `score ${v.score} not rounded to 10`).toBe(true);
  expect(v.score).toBeGreaterThanOrEqual(300);
  expect(v.score).toBeLessThanOrEqual(1000);
  if (e.band) expect(v.band, "band").toBe(e.band);
  if (e.light) expect(v.light, "light").toBe(e.light);
  if (e.behaviour) expect(v.behaviour, "behaviour").toBe(e.behaviour);
  if (e.confidence) expect(v.confidence, "confidence").toBe(e.confidence);
  if (e.exposureBand) expect(v.exposureBand, "exposure band").toBe(e.exposureBand);
  if (e.supplierBand) expect(v.supplierBand, "supplier band").toBe(e.supplierBand);
  for (const [k, want] of Object.entries(e.factors ?? {})) {
    const f = v.explanation.factors.find((x) => x.key === k);
    if (want === null) expect(f, `factor ${k} excluded`).toBeUndefined();
    else expect(f?.value, `factor ${k}`).toBeCloseTo(want, 0);
  }
  if (e.factors && Object.values(e.factors).includes(null)) {
    const sum = v.explanation.factors.reduce((s, f) => s + f.weight, 0);
    expect(Math.abs(sum - 1), "weights re-normalised to 1 (3-decimal display rounding)").toBeLessThan(0.005);
  }
  if (e.caps) {
    const caps = v.explanation.caps.map((c) => c.cap);
    if (e.caps.length === 0) expect(caps).toEqual([]);
    else expect(Math.min(...caps), "lowest applicable cap").toBe(Math.min(...e.caps));
  }
  // explainability: every factor carries a reason key
  for (const f of v.explanation.factors) expect(f.reason.key).toMatch(/^reasons\./);
}

describe("score cases (SPEC §5)", () => {
  for (const c of scoreCases) it(c.name, () => check(D.scoreBuyer(toInput(c)), c.expect));
});

describe("caps (SPEC §5, §6)", () => {
  for (const c of capCases) it(c.name, () => check(D.scoreBuyer(toInput(c)), c.expect));
});

describe("cohort freeze (anti-differencing)", () => {
  const perfect = scoreCases.find((c) => c.name === "perfect payer")!;
  const util = scoreCases.find((c) => c.name === "utilization 0.75")!;
  const prevOut = D.scoreBuyer(toInput(perfect));
  if (!prevOut.published) throw new Error("setup");
  const prev = (published: boolean, hash: string): D.PreviousRelease => ({ published, cohortHash: hash, values: published ? prevOut.values : null });

  it("same supplier set → new values, not frozen", () => {
    const out = D.scoreBuyer(toInput(util, prev(true, "h"), "h"));
    expect(out.published && out.frozen).toBe(false);
    expect(out.published && out.values.score).toBe(930);
  });
  it("supplier set changed and previous was published → previous values republished, frozen", () => {
    const out = D.scoreBuyer(toInput(util, prev(true, "old"), "new"));
    expect(out.published).toBe(true);
    if (out.published) {
      expect(out.frozen).toBe(true);
      expect(out.values.score).toBe(1000);
      expect(out.values.light).toBe("GREEN");
    }
  });
  it("supplier set changed but previous was suppressed → publish new values", () => {
    const out = D.scoreBuyer(toInput(util, prev(false, "old"), "new"));
    expect(out.published && !out.frozen && out.values.score).toBe(930);
  });
  it("floor breach suppresses immediately even with a published previous release", () => {
    const two = { name: "2", lines: perfect.lines.slice(0, 2), expect: { published: false } };
    const out = D.scoreBuyer(toInput(two, prev(true, "old"), "new"));
    expect(out.published).toBe(false);
  });
  it("cohort hash depends on the supplier set only", async () => {
    expect(await D.cohortHash(["a", "b", "c"])).toBe(await D.cohortHash(["a", "b", "c"]));
    expect(await D.cohortHash(["a", "b", "c"])).not.toBe(await D.cohortHash(["a", "b", "d"]));
  });
  it("supplierIds lists distinct eligible suppliers (for the cohort hash)", () => {
    const out = D.scoreBuyer(toInput(perfect));
    expect([...out.supplierIds].sort()).toEqual(["S1", "S2", "S3"]);
  });
});

describe("lookups", () => {
  it.each(bandEdges)("band(%d) = %s", (s, b) => expect(D.bandOf(s)).toBe(b));
  it.each(exposureEdges)("exposure(SAR %d) = %s", (sar, b) => expect(D.exposureBandOf(SAR(sar))).toBe(b));
  it.each(supplierEdges)("supplierBand(%d) = %s", (n, b) => expect(D.supplierBandOf(n)).toBe(b));
  it.each(confidenceCases)("confidence(%d suppliers, %d periods) = %s", (s, p, c) => expect(D.confidenceOf(s, p)).toBe(c));
  it.each(behaviourEdges)("behaviour(%d) = %s", (r, b) => expect(D.behaviourOf(r)).toBe(b));
  it("privacy floor is 3", () => {
    expect(D.meetsPrivacyFloor(2)).toBe(false);
    expect(D.meetsPrivacyFloor(3)).toBe(true);
  });
  it("cap values", () => expect(D.CAPS).toEqual({ unpaidDefault: 499, multipleDefaults: 399, recentDefault: 699, severeArrears: 599 }));
});

describe("properties", () => {
  it("score is monotone in on-time payment (more on time never lowers the score)", () => {
    let last = 0;
    for (let pct = 0; pct <= 100; pct += 5) {
      const lines = ["S1", "S2", "S3"].map((s) => ({
        supplierId: s, status: "ACTIVE" as const, suspended: false, closedAt: null, confirmedLimit: SAR(100_000),
        snapshots: flat(SAR(10_000)).map((x) => ({ ...x, settledTotal: SAR(1_000), settledOnTime: SAR(10 * pct) })),
      }));
      const out = D.scoreBuyer({ period: M, lines, defaults: [], previous: null, cohortHash: "h" });
      if (!out.published) throw new Error("unpublished");
      expect(out.values.score).toBeGreaterThanOrEqual(last);
      last = out.values.score;
    }
  });
  it("is deterministic and independent of line / snapshot order", () => {
    const c = scoreCases.find((x) => x.name === "recency weights 0.85^age, trend excluded and re-normalised")!;
    const a = D.scoreBuyer(toInput(c));
    const rev = toInput(c);
    rev.lines = rev.lines.reverse().map((l) => ({ ...l, snapshots: [...l.snapshots].reverse() }));
    expect(D.scoreBuyer(rev)).toEqual(a);
  });
});
