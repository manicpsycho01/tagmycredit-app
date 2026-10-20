/** SPEC §3 CFO OTP. */
import { describe, expect, it } from "vitest";
import * as D from "../src/index";

const T0 = new Date("2026-03-20T09:00:00.000Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);
const binding = { versionId: "v-1", cfoUserId: "u-cfo", phone: "+966512345678" };
const SECRET = "test-secret";

describe("OTP constants match the spec", () => {
  it("6 digits, 10 min, 5 attempts, 3 sends/hour, 30 min re-auth, lock after 3 codes for 30 min", () => {
    expect([D.OTP_DIGITS, D.OTP_TTL_MINUTES, D.OTP_MAX_ATTEMPTS, D.OTP_MAX_SENDS_PER_HOUR, D.OTP_REAUTH_MINUTES, D.OTP_FAILED_CODES_TO_LOCK, D.OTP_LOCK_MINUTES]).toEqual([6, 10, 5, 3, 30, 3, 30]);
  });
});

describe("code generation and hashing", () => {
  it("codes are 6 digits, leading zeros kept, and vary", () => {
    const codes = Array.from({ length: 2000 }, () => D.generateOtpCode());
    for (const c of codes) expect(c).toMatch(/^\d{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(1900);
  });

  it("hash is HMAC-SHA256 hex and never contains the code", async () => {
    const h = await D.hashOtp(SECRET, binding, "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("123456");
  });

  it("verifies only for the same code, secret, version, CFO user and phone", async () => {
    const h = await D.hashOtp(SECRET, binding, "123456");
    expect(await D.verifyOtp(SECRET, binding, "123456", h)).toBe(true);
    expect(await D.verifyOtp(SECRET, binding, "123457", h)).toBe(false);
    expect(await D.verifyOtp("other-secret", binding, "123456", h)).toBe(false);
    expect(await D.verifyOtp(SECRET, { ...binding, versionId: "v-2" }, "123456", h)).toBe(false);
    expect(await D.verifyOtp(SECRET, { ...binding, cfoUserId: "u-other" }, "123456", h)).toBe(false);
    expect(await D.verifyOtp(SECRET, { ...binding, phone: "+966512345679" }, "123456", h)).toBe(false);
    expect(await D.verifyOtp(SECRET, binding, " 123456", h)).toBe(false);
  });

  it("binding fields cannot be shifted into each other (no ambiguous concatenation)", async () => {
    const a = await D.hashOtp(SECRET, { versionId: "v-1u", cfoUserId: "-cfo", phone: binding.phone }, "123456");
    const b = await D.hashOtp(SECRET, binding, "123456");
    expect(a).not.toBe(b);
  });

  it("timingSafeEqualHex", () => {
    expect(D.timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(D.timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(D.timingSafeEqualHex("abcd", "abc")).toBe(false);
  });
});

describe("timing rules", () => {
  it("code expires 10 minutes after sending", () => {
    expect(D.otpExpiresAt(T0).toISOString()).toBe(min(10).toISOString());
  });

  it("send window is the last hour", () => {
    expect(D.otpSendWindowStart(T0).toISOString()).toBe(min(-60).toISOString());
  });

  it("send limits: 3 per hour, recent sign-in (30 min), lock", () => {
    const base = { now: T0, signedInAt: min(-5), sendsInLastHour: 0, lockedUntil: null };
    expect(D.otpSendBlockReason(base)).toBeNull();
    expect(D.otpSendBlockReason({ ...base, sendsInLastHour: 2 })).toBeNull();
    expect(D.otpSendBlockReason({ ...base, sendsInLastHour: 3 })).toBe("errors.otpSendLimit");
    expect(D.otpSendBlockReason({ ...base, signedInAt: min(-30) })).toBeNull();
    expect(D.otpSendBlockReason({ ...base, signedInAt: min(-31) })).toBe("errors.reauthRequired");
    expect(D.otpSendBlockReason({ ...base, lockedUntil: min(1) })).toBe("errors.otpLocked");
    expect(D.otpSendBlockReason({ ...base, lockedUntil: min(0) })).toBeNull();
  });

  it("5 attempts per code; 3 used-up codes in a row lock the version for 30 minutes", () => {
    for (let a = 1; a <= 4; a++) {
      const o = D.otpFailureOutcome(a, 0, T0);
      expect(o.exhausted, `attempt ${a}`).toBe(false);
      expect(o.attemptsLeft).toBe(5 - a);
      expect(o.lockedUntil).toBeNull();
    }
    const fifth = D.otpFailureOutcome(5, 0, T0);
    expect(fifth).toMatchObject({ exhausted: true, attemptsLeft: 0, failedCodes: 1, lockedUntil: null });
    expect(D.otpFailureOutcome(5, 1, T0)).toMatchObject({ exhausted: true, failedCodes: 2, lockedUntil: null });
    const third = D.otpFailureOutcome(5, 2, T0);
    expect(third.exhausted).toBe(true);
    expect(third.lockedUntil?.toISOString()).toBe(min(30).toISOString());
  });
});
