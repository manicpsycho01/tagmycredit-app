/** Monthly aging snapshot validation and the data-quality quarantine (SPEC §4). */
import { QUARANTINE_OVER_LIMIT_RATIO, QUARANTINE_OVERDUE_JUMP_PP } from "./rules";
import { isPeriod, periodIndex } from "./time";
import type { SnapshotInput } from "./types";

export const SNAPSHOT_AMOUNT_FIELDS = [
  "outstanding",
  "notDue",
  "d1_30",
  "d31_60",
  "d61_90",
  "d90Plus",
  "settledTotal",
  "settledOnTime",
] as const;
export type SnapshotAmountField = (typeof SNAPSHOT_AMOUNT_FIELDS)[number];

export interface SnapshotContext {
  /** Current period (Riyadh calendar month of now). Snapshots may not be for a later month. */
  currentPeriod: string;
  /** First month the line's first confirmed version is effective. */
  firstPeriod: string;
}

/** Field → i18n error key. Empty object = valid. */
export function validateSnapshot(s: SnapshotInput, ctx: SnapshotContext): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isPeriod(s.period)) errors.period = "errors.periodInvalid";
  else if (periodIndex(s.period) > periodIndex(ctx.currentPeriod)) errors.period = "errors.periodInFuture";
  else if (periodIndex(s.period) < periodIndex(ctx.firstPeriod)) errors.period = "errors.periodBeforeLine";
  for (const f of SNAPSHOT_AMOUNT_FIELDS) {
    const v = s[f];
    if (!Number.isSafeInteger(v) || v < 0) errors[f] = "errors.amountInvalid";
  }
  if (Object.keys(errors).length) return errors;
  if (s.notDue + s.d1_30 + s.d31_60 + s.d61_90 + s.d90Plus !== s.outstanding) errors.outstanding = "errors.bucketsMismatch";
  if (s.settledOnTime > s.settledTotal) errors.settledOnTime = "errors.onTimeExceedsSettled";
  return errors;
}

export type QuarantineReason = "OVERDUE_JUMP" | "OVER_LIMIT";

const late31Share = (s: Pick<SnapshotInput, "outstanding" | "d31_60" | "d61_90" | "d90Plus">) =>
  s.outstanding > 0 ? (s.d31_60 + s.d61_90 + s.d90Plus) / s.outstanding : 0;

/**
 * Quarantine rule hit for a new snapshot, or null. `previous` is the line's latest earlier snapshot (null for the first).
 * OVER_LIMIT: outstanding > 150 % of the confirmed limit. OVERDUE_JUMP: the 31+ days late share rises > 40 points.
 */
export function quarantineReason(
  s: SnapshotInput,
  previous: SnapshotInput | null,
  confirmedLimitHalalas: number,
): QuarantineReason | null {
  if (s.outstanding > confirmedLimitHalalas * QUARANTINE_OVER_LIMIT_RATIO) return "OVER_LIMIT";
  if (previous && late31Share(s) - late31Share(previous) > QUARANTINE_OVERDUE_JUMP_PP) return "OVERDUE_JUMP";
  return null;
}

/** Amount past due (all late buckets). */
export const overdueOf = (s: Pick<SnapshotInput, "d1_30" | "d31_60" | "d61_90" | "d90Plus">): number =>
  s.d1_30 + s.d31_60 + s.d61_90 + s.d90Plus;
