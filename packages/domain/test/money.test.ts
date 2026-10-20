/** Money is integer halalas; SAR is parsed at form edges without float error (DECISIONS A7). */
import { describe, expect, it } from "vitest";
import * as D from "../src/index";

describe("parseSar", () => {
  it.each([
    ["0.29", 29], // 0.29 * 100 = 28.999999999999996 in floats
    ["19.99", 1999],
    ["1.1", 110],
    ["1234567.89", 123456789],
    ["500000000", 50_000_000_000],
    ["10,000", 1_000_000],
    ["12,500.5", 1_250_050],
    [" 10000 ", 1_000_000],
    [0.29, 29],
    [10000, 1_000_000],
  ] as const)("%j → %d halalas", (input, halalas) => {
    expect(D.parseSar(input)).toBe(halalas);
  });

  it.each(["", "abc", "-5", "1.234", "1e5", "1.2.3", "Infinity", "NaN", "12 500x"])("rejects %j", (input) => {
    expect(D.parseSar(input)).toBeNull();
  });

  it("accepts Arabic-Indic digits typed on an Arabic keyboard (bilingual forms)", () => {
    // ١٢٬٥٠٠ = 12,500 SAR. See HANDOFF T2.
    expect(D.parseSar("١٢٬٥٠٠")).toBe(1_250_000);
    expect(D.parseSar("١٠٠٠٠٫٥٠")).toBe(1_000_050);
  });

  it("round-trips every halala value without drift", () => {
    for (let h = 0; h < 20_000; h += 7) {
      const sar = (h / 100).toFixed(2);
      expect(D.parseSar(sar)).toBe(h);
    }
  });

  it("halalasToSar / formatSar", () => {
    expect(D.halalasToSar(123456)).toBe(1234.56);
    expect(D.formatSar(123456)).toMatch(/1,234\.56|1,235|1\.2K/);
  });
});
