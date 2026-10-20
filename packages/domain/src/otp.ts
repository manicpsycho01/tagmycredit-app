/**
 * CFO confirmation codes (SPEC §3). Uses Web Crypto so the module is valid in every runtime.
 * A code is bound to (line version, CFO user, phone): the binding is part of the HMAC input, so a code hashed for
 * one binding never verifies for another.
 */
import { hmacSha256Hex, timingSafeEqualHex } from "./crypto";
import { addMinutes, HOUR_MS, MINUTE_MS } from "./time";

export const OTP_DIGITS = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_HOUR = 3;
/** CFO must have signed in within this many minutes to request a code. */
export const OTP_REAUTH_MINUTES = 30;
/** This many consecutive codes used up without success lock the version. */
export const OTP_FAILED_CODES_TO_LOCK = 3;
export const OTP_LOCK_MINUTES = 30;

export interface OtpBinding {
  versionId: string;
  cfoUserId: string;
  phone: string;
}

/** Uniform 6-digit code (rejection sampling, no modulo bias). */
export function generateOtpCode(): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return String(buf[0]! % 1_000_000).padStart(OTP_DIGITS, "0");
  }
}

export const hashOtp = (secret: string, binding: OtpBinding, code: string): Promise<string> =>
  hmacSha256Hex(secret, `otp:v1|${binding.versionId}|${binding.cfoUserId}|${binding.phone}|${code}`);

export async function verifyOtp(secret: string, binding: OtpBinding, code: string, storedHash: string): Promise<boolean> {
  if (!new RegExp(`^\\d{${OTP_DIGITS}}$`).test(code)) return false;
  return timingSafeEqualHex(await hashOtp(secret, binding, code), storedHash);
}

export const otpExpiresAt = (now: Date): Date => addMinutes(now, OTP_TTL_MINUTES);
export const otpSendWindowStart = (now: Date): Date => new Date(now.getTime() - HOUR_MS);

/** Why a code may not be sent now (i18n key), or null. */
export function otpSendBlockReason(input: {
  now: Date;
  signedInAt: Date;
  sendsInLastHour: number;
  lockedUntil: Date | null;
}): string | null {
  if (input.lockedUntil && input.lockedUntil > input.now) return "errors.otpLocked";
  if (input.now.getTime() - input.signedInAt.getTime() > OTP_REAUTH_MINUTES * MINUTE_MS) return "errors.reauthRequired";
  if (input.sendsInLastHour >= OTP_MAX_SENDS_PER_HOUR) return "errors.otpSendLimit";
  return null;
}

/**
 * Outcome of a wrong code: whether the challenge is now used up, and whether the version must lock
 * (OTP_FAILED_CODES_TO_LOCK consecutive used-up codes).
 */
export function otpFailureOutcome(attemptsAfter: number, failedCodesBefore: number, now: Date) {
  const exhausted = attemptsAfter >= OTP_MAX_ATTEMPTS;
  const failedCodes = exhausted ? failedCodesBefore + 1 : failedCodesBefore;
  const lock = failedCodes >= OTP_FAILED_CODES_TO_LOCK;
  return {
    exhausted,
    failedCodes: lock ? 0 : failedCodes,
    lockedUntil: lock ? addMinutes(now, OTP_LOCK_MINUTES) : null,
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - attemptsAfter),
  };
}
