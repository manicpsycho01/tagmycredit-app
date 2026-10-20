/** Every numeric product rule in one place (docs/SPEC.md). Services and UI import these; never re-type a number. */

/** Credit-line limit range, halalas (SAR 10,000 – 500,000,000). */
export const LIMIT_MIN_HALALAS = 1_000_000;
export const LIMIT_MAX_HALALAS = 50_000_000_000;

/** Version confirmations expire after this many days. */
export const CONFIRM_WINDOW_DAYS = 14;
/** Supplier must answer a closure request within this many days, else the line auto-closes. */
export const CLOSURE_RESPONSE_DAYS = 14;
/** Supplier must answer a dispute within this many days, else it escalates to ops. */
export const DISPUTE_RESPONSE_DAYS = 14;
/** Ops decision target for an escalated dispute. */
export const DISPUTE_OPS_TARGET_DAYS = 10;
/** Buyer CFO may dispute within this many days of a version confirmation or a snapshot. */
export const DISPUTE_WINDOW_DAYS = 30;
/** A dispute rejected within this many days means a new one must reference a newer snapshot. */
export const DISPUTE_REJECTION_COOLDOWN_DAYS = 90;
/** ACTIVE lines with no snapshot for this many days close automatically. */
export const STALE_LINE_DAYS = 90;
/** Buyer CFO may reply to a default report within this many days. */
export const DEFAULT_REPLY_DAYS = 10;
/** A default report needs the oldest unpaid amount to be at least this many days past due. */
export const DEFAULT_MIN_OVERDUE_DAYS = 90;
/** Approved CFO nominations become ACTIVE after this cooling-off period. */
export const CFO_COOLING_OFF_HOURS = 48;
/** Company invitations stay valid this long. */
export const INVITE_VALID_DAYS = 7;

/** Fewer eligible distinct suppliers than this → nothing about the buyer is shown. */
export const PRIVACY_FLOOR = 3;

/** Evidence uploads. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const MAX_UPLOAD_FILES = 5;

/** Snapshot data-quality quarantine (SPEC §4). */
export const QUARANTINE_OVERDUE_JUMP_PP = 0.4;
export const QUARANTINE_OVER_LIMIT_RATIO = 1.5;
/** Suppliers with this many rejected snapshots in 12 months are flagged to ops. */
export const REJECTED_SNAPSHOT_FLAG_COUNT = 3;

/** Snapshot for month M is due by this day of M+1 (Riyadh calendar). */
export const SNAPSHOT_DUE_DAY = 10;
/** Monthly score release day of M+1 (Riyadh calendar). */
export const RELEASE_DAY = 15;
/** Tasks become "urgent" this many days before their deadline. */
export const URGENT_WITHIN_DAYS = 3;

/** Free-text limits. */
export const TEXT_SHORT_MAX = 200;
export const TEXT_LONG_MAX = 2000;
