/** Shared vocabulary for rules, database and UI. Values match the Postgres enums in @tmc/db. */

export const MEMBER_ROLES = ["OWNER", "ADMIN", "CREDIT_MANAGER", "VIEWER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export type CompanyStatus = "UNVERIFIED" | "VERIFIED" | "SUSPENDED";
export type LineStatus = "PENDING" | "ACTIVE" | "DECLINED" | "EXPIRED" | "CLOSED" | "VOIDED";
export type VersionStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "EXPIRED" | "SUPERSEDED";
export type DisputeStatus = "OPEN" | "RESPONDED" | "SUSPENDED" | "REJECTED" | "UPHELD";
export type ClosureStatus = "OPEN" | "ACCEPTED" | "OBJECTED" | "AUTO_CLOSED";
export type DefaultStatus = "UNDER_REVIEW" | "INFO_REQUESTED" | "UPHELD" | "REJECTED" | "RETRACTED" | "SETTLED";
export type CfoStatus = "NOMINATED" | "APPROVED" | "ACTIVE" | "REJECTED" | "ENDED";

export const TERMS_DAYS = [30, 45, 60, 90, 120] as const;
export type TermsDays = (typeof TERMS_DAYS)[number];

export type Band = "POOR" | "FAIR" | "GOOD" | "EXCELLENT";
export type Light = "GREEN" | "YELLOW" | "RED";
export type Behaviour = "HIGH" | "MEDIUM" | "LOW";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type SuppressedReason = "BELOW_FLOOR" | "NO_PAYMENT_DATA";
export type FactorKey = "payment" | "delinquency" | "utilization" | "trend";

/** One month of a line's aging report, in halalas. `period` = 'YYYY-MM-01'. */
export interface SnapshotInput {
  period: string;
  outstanding: number;
  notDue: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90Plus: number;
  settledTotal: number;
  settledOnTime: number;
}
