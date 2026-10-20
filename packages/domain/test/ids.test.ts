/** SPEC §1: TMC-ID `TMC-SA-AAAA-BBBB-NN-K`, TCL-ID `TCL-SA-NNNNNNN`, CR and mobile formats. */
import { describe, expect, it } from "vitest";
import * as D from "../src/index";

const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const RE = /^TMC-SA-(\d{4})-(\d{4})-(\d{2})-([0-9A-Z])$/;

describe("TMC-ID", () => {
  const id = D.buildTmcId("1234", "1010123456", 1);

  it("has the format TMC-SA-AAAA-BBBB-NN-K with BBBB = last 4 of CR", () => {
    expect(id).toMatch(RE);
    const [, a, b, nn] = RE.exec(id)!;
    expect([a, b, nn]).toEqual(["1234", "3456", "01"]);
  });

  it("check char is derived from the 10 digits AAAABBBBNN, alphabet 0-9A-Z", () => {
    const k = RE.exec(id)![4]!;
    expect(ALPHA).toContain(k);
    expect(D.tmcCheckChar("1234345601")).toBe(k);
  });

  it("parses and validates its own output", () => {
    expect(D.isTmcId(id)).toBe(true);
    expect(D.parseTmcId(id)).not.toBeNull();
  });

  // HANDOFF T3: weights 4/6/8/9 share factors with 36, so e.g. NN "01" → "41" keeps the same check char.
  it("rejects every single-digit tampering and every wrong check char", () => {
    const positions = [7, 8, 9, 10, 12, 13, 14, 15, 17, 18];
    for (const p of positions) {
      for (const d of "0123456789") {
        if (id[p] === d) continue;
        const t = id.slice(0, p) + d + id.slice(p + 1);
        expect(D.isTmcId(t), t).toBe(false);
      }
    }
    for (const c of ALPHA) {
      if (c === id.at(-1)) continue;
      expect(D.isTmcId(id.slice(0, -1) + c), c).toBe(false);
    }
  });

  it("rejects malformed ids", () => {
    for (const bad of ["", "TMC-SA-1234-3456-01", "TMC-AE-1234-3456-01-" + id.at(-1), "TMC-SA-123-3456-01-X", "TMC-SA-1234-3456-1-X", id + "0", "TMCSA12343456014"]) {
      expect(D.isTmcId(bad), bad).toBe(false);
    }
  });

  it("sequence must be 01–99", () => {
    expect(D.buildTmcId("0000", "1010123456", 99)).toMatch(/-99-/);
    for (const seq of [0, 100]) {
      let ok: boolean;
      try {
        ok = D.isTmcId(D.buildTmcId("0000", "1010123456", seq));
      } catch {
        ok = false;
      }
      expect(ok, `sequence ${seq}`).toBe(false);
    }
  });

  it("random part is 4 digits", () => {
    for (const n of [0, 7, 9999, 12345.6]) expect(D.tmcRandomDigits(n)).toMatch(/^\d{4}$/);
  });
});

describe("TCL-ID", () => {
  it("formats a 7-digit sequence", () => {
    expect(D.formatTclId(42)).toBe("TCL-SA-0000042");
    expect(D.formatTclId(9_999_999)).toBe("TCL-SA-9999999");
    expect(D.isTclId("TCL-SA-0000042")).toBe(true);
    expect(D.isTclId("TCL-SA-000042")).toBe(false);
    expect(D.isTclId("TCL-SA-00000420")).toBe(false);
  });
});

describe("CR number and Saudi mobile", () => {
  it("CR = exactly 10 ASCII digits", () => {
    expect(D.isCrNumber("1010123456")).toBe(true);
    for (const bad of ["101012345", "10101234567", "10101234a6", " 1010123456", ""]) expect(D.isCrNumber(bad), bad).toBe(false);
  });
  it("normalises Saudi mobiles to +9665XXXXXXXX", () => {
    for (const ok of ["+966512345678", "0512345678", "966512345678", "+966 51 234 5678"]) {
      expect(D.normaliseSaudiMobile(ok), ok).toBe("+966512345678");
    }
    for (const bad of ["0412345678", "+966412345678", "05123456", "+9715012345678", "hello"]) expect(D.normaliseSaudiMobile(bad), bad).toBeNull();
  });
  it("masked mobile hides the middle digits", () => {
    const m = D.maskMobile("+966512345678");
    expect(m).toContain("678");
    expect(m).not.toContain("1234");
  });
});
