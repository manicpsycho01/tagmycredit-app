/** SPEC §4: snapshot validation, quarantine rules and CSV upload. */
import { describe, expect, it } from "vitest";
import * as D from "../src/index";
import { quarantineCases, snap } from "./cases";

const ok: D.SnapshotInput = { period: "2026-02-01", outstanding: 1000, notDue: 400, d1_30: 300, d31_60: 200, d61_90: 50, d90Plus: 50, settledTotal: 500, settledOnTime: 400 };
const ctx = { currentPeriod: "2026-03-01", firstPeriod: "2025-06-01" };

describe("validateSnapshot", () => {
  it("valid snapshot → no errors", () => {
    expect(D.validateSnapshot(ok, ctx)).toEqual({});
  });
  it("buckets must sum to outstanding", () => {
    expect(Object.keys(D.validateSnapshot({ ...ok, outstanding: 1001 }, ctx)).length).toBeGreaterThan(0);
  });
  it("settled on time ≤ settled total", () => {
    expect(D.validateSnapshot({ ...ok, settledOnTime: 501 }, ctx)).toHaveProperty("settledOnTime");
  });
  it("on time = total is fine; zero settled is fine", () => {
    expect(D.validateSnapshot({ ...ok, settledOnTime: 500 }, ctx)).toEqual({});
    expect(D.validateSnapshot({ ...ok, settledOnTime: 0, settledTotal: 0 }, ctx)).toEqual({});
  });
  it("period: not in the future, not before the line's first month, first of month", () => {
    expect(D.validateSnapshot({ ...ok, period: "2026-03-01" }, ctx)).toEqual({}); // current month allowed
    expect(D.validateSnapshot({ ...ok, period: "2026-04-01" }, ctx)).toHaveProperty("period");
    expect(D.validateSnapshot({ ...ok, period: "2025-05-01" }, ctx)).toHaveProperty("period");
    expect(D.validateSnapshot({ ...ok, period: "2025-06-01" }, ctx)).toEqual({});
    expect(D.validateSnapshot({ ...ok, period: "2026-02-15" }, ctx)).toHaveProperty("period");
  });
  it("amounts: non-negative integers (halalas)", () => {
    expect(D.validateSnapshot({ ...ok, notDue: -1, d1_30: 302 }, ctx)).toHaveProperty("notDue");
    expect(D.validateSnapshot({ ...ok, notDue: 399.5, d1_30: 300.5 }, ctx)).toHaveProperty("notDue");
    expect(D.validateSnapshot({ ...ok, outstanding: Number.NaN }, ctx)).toHaveProperty("outstanding");
  });
  it("errors are i18n keys", () => {
    for (const v of Object.values(D.validateSnapshot({ ...ok, outstanding: 5, settledOnTime: 900, period: "2030-01-01" }, ctx))) expect(v).toMatch(/^errors\.\w+/);
  });
});

describe("quarantineReason (data-quality rules)", () => {
  for (const [prev, cur, limit, expected, name] of quarantineCases) {
    it(`${name} → ${expected ?? "accepted"}`, () => {
      expect(D.quarantineReason(snap(0, cur), prev ? snap(1, prev) : null, limit)).toBe(expected);
    });
  }
});

describe("parseSnapshotCsv", () => {
  const header = D.SNAPSHOT_CSV_COLUMNS.join(",");
  it("header matches the spec", () => {
    expect(header).toBe("tcl_id,period,outstanding,not_due,d1_30,d31_60,d61_90,d90_plus,settled_total,settled_on_time");
  });
  it("parses SAR amounts into halalas, row numbers 1-based with the header as row 1", () => {
    const r = D.parseSnapshotCsv(`${header}\nTCL-SA-0000001,2026-02-01,1000.50,1000.50,0,0,0,0,200,150.25\n`);
    expect(r.fileError).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ row: 2, tclId: "TCL-SA-0000001", snapshot: { period: "2026-02-01", outstanding: 100050, notDue: 100050, settledTotal: 20000, settledOnTime: 15025 } });
  });
  it("handles CRLF, a UTF-8 BOM (Excel) and quoted thousands", () => {
    const r = D.parseSnapshotCsv(`﻿${header}\r\nTCL-SA-0000001,2026-02-01,"12,500.00","12,500.00",0,0,0,0,0,0\r\n`);
    expect(r.fileError).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.snapshot.outstanding).toBe(1_250_000);
  });
  it("reports bad rows without dropping good ones", () => {
    const r = D.parseSnapshotCsv([header, "TCL-SA-0000001,2026-02-01,100,100,0,0,0,0,0,0", "TCL-SA-0000002,2026-02-01,abc,100,0,0,0,0,0,0", "TCL-SA-0000003,2026-02-01,100,100", "TCL-SA-0000004,2026-02-01,100,50,0,0,0,0,0,0", ""].join("\n"));
    expect(r.rows.map((x) => x.tclId)).toContain("TCL-SA-0000001");
    const bad = r.errors.map((e) => e.row);
    expect(bad).toContain(3);
    expect(bad).toContain(4);
    for (const e of r.errors) expect(e.error).toMatch(/^errors\./);
    // row 5: buckets don't sum — either rejected here or by validateSnapshot later
    const row5 = r.rows.find((x) => x.row === 5);
    if (row5) expect(Object.keys(D.validateSnapshot(row5.snapshot, { currentPeriod: "2026-03-01", firstPeriod: "2020-01-01" })).length).toBeGreaterThan(0);
  });
  it("wrong header or empty file → file error", () => {
    expect(D.parseSnapshotCsv("").fileError).toMatch(/^errors\./);
    expect(D.parseSnapshotCsv("a,b,c\n1,2,3").fileError).toMatch(/^errors\./);
  });
  it(`more than the max rows → file error`, () => {
    const rows = Array.from({ length: D.SNAPSHOT_CSV_MAX_ROWS + 1 }, (_, i) => `TCL-SA-${String(i).padStart(7, "0")},2026-02-01,0,0,0,0,0,0,0,0`);
    expect(D.parseSnapshotCsv([header, ...rows].join("\n")).fileError).toMatch(/^errors\./);
  });
  it("negative amounts are row errors (unknown TCL ids are rejected by the upload service)", () => {
    const r = D.parseSnapshotCsv([header, "TCL-SA-0000001,2026-02-01,-100,-100,0,0,0,0,0,0"].join("\n"));
    expect(r.errors.map((e) => e.row)).toEqual([2]);
  });
});
