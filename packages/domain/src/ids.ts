/**
 * Identifiers.
 * TMC-ID `TMC-SA-AAAA-BBBB-NN-K`: AAAA random digits (not reversible to identity), BBBB last 4 CR digits,
 * NN collision sequence 01–99, K = ISO 7064 MOD 37,36 check character over the 10 digits AAAABBBBNN (alphabet 0-9A-Z).
 * Credit line ID `TCL-SA-NNNNNNN` (7-digit sequence).
 */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TMC_RE = /^TMC-SA-(\d{4})-(\d{4})-(\d{2})-([0-9A-Z])$/;
const TCL_RE = /^TCL-SA-(\d{7})$/;
const CR_RE = /^\d{10}$/;

export const isCrNumber = (s: string): boolean => CR_RE.test(s);

/** ISO 7064 MOD 37,36 hybrid check character: detects every single-character substitution and most transpositions. */
export function tmcCheckChar(digits: string): string {
  let p = 36;
  for (const ch of digits) {
    let s = (p + ALPHABET.indexOf(ch)) % 36;
    if (s === 0) s = 36;
    p = (s * 2) % 37;
  }
  return ALPHABET[(37 - p) % 36]!;
}

/** Build a TMC-ID from 4 random digits, the CR number and the collision sequence (1–99). */
export function buildTmcId(randomDigits: string, crNumber: string, sequence: number): string {
  if (!/^\d{4}$/.test(randomDigits)) throw new Error("randomDigits must be 4 digits");
  if (!isCrNumber(crNumber)) throw new Error("crNumber must be 10 digits");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99) throw new Error("sequence must be 1–99");
  const nn = String(sequence).padStart(2, "0");
  const body = `${randomDigits}${crNumber.slice(-4)}${nn}`;
  return `TMC-SA-${randomDigits}-${crNumber.slice(-4)}-${nn}-${tmcCheckChar(body)}`;
}

export interface TmcIdParts {
  random: string;
  crSuffix: string;
  sequence: number;
  check: string;
}

/** Parts of a well-formed TMC-ID with a valid check character, else null. Case and surrounding space are ignored. */
export function parseTmcId(input: string): TmcIdParts | null {
  const m = TMC_RE.exec(input.trim().toUpperCase());
  if (!m) return null;
  const [, random, crSuffix, nn, check] = m as unknown as [string, string, string, string, string];
  const sequence = Number(nn);
  if (sequence < 1 || tmcCheckChar(`${random}${crSuffix}${nn}`) !== check) return null;
  return { random, crSuffix, sequence, check };
}

export const isTmcId = (input: string): boolean => parseTmcId(input) !== null;

/** 4 random digits for a new TMC-ID from a uniform random integer source (0 ≤ n < 10000). */
export const tmcRandomDigits = (n: number): string => String(Math.floor(n) % 10000).padStart(4, "0");

export function formatTclId(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9_999_999) throw new Error("TCL sequence out of range");
  return `TCL-SA-${String(sequence).padStart(7, "0")}`;
}

export const isTclId = (input: string): boolean => TCL_RE.test(input.trim().toUpperCase());

/** Saudi mobile in E.164: +9665XXXXXXXX. Accepts 05XXXXXXXX / 9665XXXXXXXX / spaces and normalises. */
export function normaliseSaudiMobile(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  const m = /^(?:\+?966|0)?(5\d{8})$/.exec(digits);
  return m ? `+966${m[1]}` : null;
}

/** "+966 5•• ••• 123" style mask for showing a phone number. */
export const maskMobile = (mobile: string): string => `${mobile.slice(0, 4)} ${mobile.slice(4, 5)}•• ••• ${mobile.slice(-3)}`;
