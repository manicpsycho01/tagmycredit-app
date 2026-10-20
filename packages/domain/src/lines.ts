/**
 * Credit-line lifecycle rules (SPEC §2, §6): who may do what, given the line's state and timers.
 * The server enforces actions with the same function it uses to tell the UI what to show.
 */
import { DEFAULT_MIN_OVERDUE_DAYS, DISPUTE_REJECTION_COOLDOWN_DAYS, DISPUTE_WINDOW_DAYS, LIMIT_MAX_HALALAS, LIMIT_MIN_HALALAS } from "./rules";
import { DAY_MS, isIsoDate } from "./time";
import { TERMS_DAYS, type CompanyStatus, type DefaultStatus, type DisputeStatus, type LineStatus, type MemberRole, type TermsDays } from "./types";

export const LINE_ACTIONS = [
  "AMEND",
  "CLOSE",
  "SUBMIT_SNAPSHOT",
  "FILE_DEFAULT",
  "RESPOND_DISPUTE",
  "RESPOND_CLOSURE",
  "RETRACT_DEFAULT",
  "MARK_DEFAULT_SETTLED",
  "CONFIRM",
  "DECLINE",
  "DISPUTE",
  "REQUEST_CLOSURE",
  "REPLY_DEFAULT",
] as const;
export type LineAction = (typeof LINE_ACTIONS)[number];

/** Roles that operate credit lines (create, amend, close, report, file defaults, respond). */
export const LINE_MANAGER_ROLES: readonly MemberRole[] = ["OWNER", "ADMIN", "CREDIT_MANAGER"];
/** Roles that manage the team and nominate the CFO. */
export const TEAM_ADMIN_ROLES: readonly MemberRole[] = ["OWNER", "ADMIN"];

export const canManageLines = (role: MemberRole | null): boolean => role !== null && LINE_MANAGER_ROLES.includes(role);
export const canManageTeam = (role: MemberRole | null): boolean => role !== null && TEAM_ADMIN_ROLES.includes(role);

export const OPEN_DISPUTE_STATUSES: readonly DisputeStatus[] = ["OPEN", "RESPONDED", "ESCALATED"];
export const OPEN_DEFAULT_STATUSES: readonly DefaultStatus[] = ["UNDER_REVIEW", "INFO_REQUESTED"];

/** Everything about a line that decides the available actions. Loaded by the server in one query. */
export interface LineFacts {
  status: LineStatus;
  pendingVersion: { version: number; expiresAt: Date; lockedUntil: Date | null } | null;
  openDispute: { status: DisputeStatus } | null;
  openClosure: boolean;
  openDefault: { status: DefaultStatus; buyerReplied: boolean; buyerReplyBy: Date } | null;
  /** UPHELD default not yet confirmed settled. */
  upheldDefault: { settlementClaimed: boolean } | null;
  /** d90_plus of the line's latest snapshot (0 if none). */
  latestD90Plus: number;
  /** Latest version confirmation or snapshot submission. */
  lastDisputableEventAt: Date | null;
  /** Most recent rejected dispute decision on this line. */
  lastRejectedDisputeAt: Date | null;
}

export interface LineViewer {
  side: "SUPPLIER" | "BUYER";
  role: MemberRole;
  isCfo: boolean;
  companyStatus: CompanyStatus;
}

/** Why the buyer CFO cannot dispute now (i18n key), or null. */
export function disputeBlockReason(f: LineFacts, now: Date): string | null {
  if (f.status !== "ACTIVE" && f.status !== "CLOSED") return "errors.lineNotDisputable";
  if (f.openDispute) return "errors.disputeAlreadyOpen";
  if (!f.lastDisputableEventAt || now.getTime() - f.lastDisputableEventAt.getTime() > DISPUTE_WINDOW_DAYS * DAY_MS) {
    return "errors.disputeWindowClosed";
  }
  return null;
}

/** After a rejection within 90 days, a new dispute must cite a snapshot submitted after that rejection. */
export function disputeNeedsNewerSnapshot(f: Pick<LineFacts, "lastRejectedDisputeAt">, now: Date): boolean {
  return f.lastRejectedDisputeAt !== null && now.getTime() - f.lastRejectedDisputeAt.getTime() <= DISPUTE_REJECTION_COOLDOWN_DAYS * DAY_MS;
}

export function lineActions(f: LineFacts, viewer: LineViewer, now: Date): { actions: LineAction[]; disputeBlockedReason: string | null } {
  const actions: LineAction[] = [];
  if (viewer.companyStatus !== "VERIFIED") return { actions, disputeBlockedReason: null };
  const live = f.status === "ACTIVE" || f.status === "CLOSED";

  if (viewer.side === "SUPPLIER") {
    if (!canManageLines(viewer.role)) return { actions, disputeBlockedReason: null };
    if (f.status === "ACTIVE" && !f.pendingVersion) actions.push("AMEND");
    if (f.status === "ACTIVE") actions.push("CLOSE");
    if (live) actions.push("SUBMIT_SNAPSHOT");
    if (live && f.latestD90Plus > 0 && !f.openDefault && !f.upheldDefault) actions.push("FILE_DEFAULT");
    if (f.openDispute?.status === "OPEN") actions.push("RESPOND_DISPUTE");
    if (f.openClosure && f.status === "ACTIVE") actions.push("RESPOND_CLOSURE");
    if (f.openDefault) actions.push("RETRACT_DEFAULT");
    if (f.upheldDefault && !f.upheldDefault.settlementClaimed) actions.push("MARK_DEFAULT_SETTLED");
    return { actions, disputeBlockedReason: null };
  }

  if (!viewer.isCfo) return { actions, disputeBlockedReason: null };
  const pv = f.pendingVersion;
  if (pv && pv.expiresAt > now && (f.status === "PENDING" || f.status === "ACTIVE")) {
    if (!pv.lockedUntil || pv.lockedUntil <= now) actions.push("CONFIRM");
    actions.push("DECLINE");
  }
  const disputeBlockedReason = disputeBlockReason(f, now);
  if (!disputeBlockedReason) actions.push("DISPUTE");
  if (f.status === "ACTIVE" && !f.openClosure) actions.push("REQUEST_CLOSURE");
  if (f.openDefault && !f.openDefault.buyerReplied && f.openDefault.buyerReplyBy > now) actions.push("REPLY_DEFAULT");
  return { actions, disputeBlockedReason };
}

/* ───────── New line ───────── */

export interface NewLineCheck {
  viewerRole: MemberRole | null;
  viewerCompanyStatus: CompanyStatus;
  sameCompany: boolean;
  buyerStatus: CompanyStatus;
  buyerHasActiveCfo: boolean;
  hasOpenLine: boolean;
}

/** Why the viewer cannot open a line to this buyer now (i18n key), or null. */
export function newLineBlockReason(c: NewLineCheck): string | null {
  if (!canManageLines(c.viewerRole)) return "errors.forbidden";
  if (c.viewerCompanyStatus !== "VERIFIED") return "errors.companyNotVerified";
  if (c.sameCompany) return "errors.cannotTagSelf";
  if (c.buyerStatus !== "VERIFIED") return "errors.buyerNotVerified";
  if (!c.buyerHasActiveCfo) return "errors.buyerNoCfo";
  if (c.hasOpenLine) return "errors.lineAlreadyOpen";
  return null;
}

export const isTermsDays = (n: number): n is TermsDays => (TERMS_DAYS as readonly number[]).includes(n);
export const isLimitInRange = (halalas: number): boolean => halalas >= LIMIT_MIN_HALALAS && halalas <= LIMIT_MAX_HALALAS;

/** Effective date: a real date, at most 1 year back and 90 days ahead of `today` ('YYYY-MM-DD'). */
export function effectiveDateError(date: string, today: string): string | null {
  if (!isIsoDate(date)) return "errors.dateInvalid";
  const diff = (Date.parse(date) - Date.parse(today)) / DAY_MS;
  if (diff > 90 || diff < -366) return "errors.effectiveDateRange";
  return null;
}

/* ───────── Default reports ───────── */

/** Field → i18n error key for a default report. */
export function defaultReportErrors(input: { amount: number; oldestDueDate: string; latestD90Plus: number; today: string; files: number }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.latestD90Plus <= 0) errors.amountSar = "errors.defaultNeeds90Plus";
  else if (input.amount <= 0 || input.amount > input.latestD90Plus) errors.amountSar = "errors.defaultAmountRange";
  if (!isIsoDate(input.oldestDueDate)) errors.oldestDueDate = "errors.dateInvalid";
  else if ((Date.parse(input.today) - Date.parse(input.oldestDueDate)) / DAY_MS < DEFAULT_MIN_OVERDUE_DAYS) errors.oldestDueDate = "errors.defaultNotOverdue";
  if (input.files < 1) errors.files = "errors.evidenceRequired";
  return errors;
}
