/** Business calendar is Asia/Riyadh (UTC+3). Periods, due dates and release timing (SPEC §4, §5). */
import { describe, expect, it } from "vitest";
import * as D from "../src/index";

const at = (iso: string) => new Date(iso);

describe("Riyadh calendar", () => {
  it("21:00 UTC is already the next day in Riyadh", () => {
    expect(D.riyadhIsoDate(at("2026-09-30T20:59:59Z"))).toBe("2026-09-30");
    expect(D.riyadhIsoDate(at("2026-09-30T21:00:00Z"))).toBe("2026-10-01");
    expect(D.periodOf(at("2026-09-30T21:00:00Z"))).toBe("2026-10-01");
    expect(D.periodOf(at("2026-09-30T20:59:59Z"))).toBe("2026-09-01");
  });
  it("period arithmetic crosses years", () => {
    expect(D.addPeriods("2026-01-01", -1)).toBe("2025-12-01");
    expect(D.addPeriods("2025-12-01", 1)).toBe("2026-01-01");
    expect(D.addPeriods("2026-02-01", -11)).toBe("2025-03-01");
    expect(D.periodsBetween("2025-03-01", "2026-02-01")).toBe(11);
  });
  it("isPeriod accepts first-of-month only", () => {
    expect(D.isPeriod("2026-02-01")).toBe(true);
    for (const p of ["2026-02-02", "2026-13-01", "2026-2-01", "2026-02"]) expect(D.isPeriod(p), p).toBe(false);
  });
});

describe("snapshot due date and release timing", () => {
  it("snapshot for M is due by the 10th of M+1", () => {
    expect(D.snapshotDueDate("2026-09-01")).toBe("2026-10-10");
    expect(D.snapshotDueDate("2026-12-01")).toBe("2027-01-10");
  });
  it("the reporting period is the previous month", () => {
    expect(D.reportingPeriod(at("2026-10-15T06:00:00Z"))).toBe("2026-09-01");
    expect(D.reportingPeriod(at("2026-01-03T06:00:00Z"))).toBe("2025-12-01");
  });
  it("release on the 15th of M+1 scores M (Riyadh time)", () => {
    expect(D.RELEASE_DAY).toBe(15);
    expect(D.scheduledReleasePeriod(at("2026-10-14T20:59:00Z"))).toBeNull();
    expect(D.scheduledReleasePeriod(at("2026-10-14T21:00:00Z"))).toBe("2026-09-01");
    expect(D.scheduledReleasePeriod(at("2026-10-20T10:00:00Z"))).toBe("2026-09-01");
  });
});

describe("rule constants match the spec", () => {
  it("windows, limits and floor", () => {
    expect({
      floor: D.PRIVACY_FLOOR, min: D.LIMIT_MIN_HALALAS, max: D.LIMIT_MAX_HALALAS, terms: [...D.TERMS_DAYS],
      confirm: D.CONFIRM_WINDOW_DAYS, closure: D.CLOSURE_RESPONSE_DAYS, disputeResp: D.DISPUTE_RESPONSE_DAYS,
      disputeWin: D.DISPUTE_WINDOW_DAYS, opsTarget: D.DISPUTE_OPS_TARGET_DAYS, redispute: D.DISPUTE_REJECTION_COOLDOWN_DAYS,
      stale: D.STALE_LINE_DAYS, reply: D.DEFAULT_REPLY_DAYS, cooling: D.CFO_COOLING_OFF_HOURS, due: D.SNAPSHOT_DUE_DAY,
      upload: D.MAX_UPLOAD_BYTES, jump: D.QUARANTINE_OVERDUE_JUMP_PP, over: D.QUARANTINE_OVER_LIMIT_RATIO,
    }).toEqual({
      floor: 3, min: 1_000_000, max: 50_000_000_000, terms: [30, 45, 60, 90, 120], confirm: 14, closure: 14, disputeResp: 14,
      disputeWin: 30, opsTarget: 10, redispute: 90, stale: 90, reply: 10, cooling: 48, due: 10, upload: 5 * 1024 * 1024, jump: 0.4, over: 1.5,
    });
  });
});
