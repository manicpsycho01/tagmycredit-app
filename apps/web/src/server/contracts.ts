/**
 * The contract between the UI (frontend) and the server layer (backend).
 *
 * - Pages (server components) call loaders exported from `@/server/queries`.
 * - Forms/buttons call server actions exported from `@/server/actions`.
 * Both modules must export exactly the names in `Queries` / `Actions` below with these signatures.
 * All money values are integer halalas (SAR x 100). Dates are ISO strings.
 * Error and status texts are i18n keys (see `@/i18n`), never raw English.
 */
import type {
  Band,
  Behaviour,
  CfoStatus,
  ClosureStatus,
  CompanyStatus,
  Confidence,
  DefaultStatus,
  DisputeStatus,
  FactorKey,
  Light,
  LineStatus,
  MemberRole,
  SnapshotInput,
  SuppressedReason,
  TermsDays,
  VersionStatus,
} from "@tmc/domain";

/* ───────────── Results ───────────── */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/* ───────────── Session ───────────── */

export interface CompanyRef {
  id: string;
  tmcId: string;
  legalName: string;
  legalNameAr: string | null;
}

export interface SessionContext {
  user: { id: string; name: string; email: string };
  /** null only for staff accounts that belong to no company. */
  company: (CompanyRef & { status: CompanyStatus; city: string; sector: string; crNumber: string }) | null;
  role: MemberRole | null;
  isCfo: boolean;
  isStaff: boolean;
  demoMode: boolean;
}

/* ───────────── Scores ───────────── */

export interface ScoreBadge {
  score: number;
  band: Band;
  light: Light;
}

export interface ScoreFactorView {
  key: FactorKey;
  /** 0–100 */
  value: number;
  /** effective weight after re-normalisation, 0–1 */
  weight: number;
  /** i18n key + params for the plain-language reason */
  reason: { key: string; params: Record<string, string | number> };
}

export interface ScoreCard {
  company: CompanyRef & { city: string; sector: string };
  /** 'YYYY-MM-01' of the release, null if never released */
  releasePeriod: string | null;
  published: boolean;
  suppressedReason: SuppressedReason | null;
  frozen: boolean;
  score: number | null;
  band: Band | null;
  light: Light | null;
  behaviour: Behaviour | null;
  confidence: Confidence | null;
  exposureBand: string | null;
  supplierBand: string | null;
  factors: ScoreFactorView[];
  caps: { key: string; cap: number }[];
  /** The "Bad-debt history" row (SPEC §5): i18n key + params; null when not published. */
  defaultsReason: { key: string; params: Record<string, string | number> } | null;
  /** Upheld unresolved default exists (only when published). */
  activeAlert: boolean;
  /** Score history for a sparkline (published releases only, oldest first). */
  history: { period: string; score: number }[];
}

/* ───────────── Lines ───────────── */

export type Side = "GIVEN" | "RECEIVED";

export interface LineSummary {
  id: string;
  tclId: string;
  side: Side;
  counterparty: CompanyRef;
  status: LineStatus;
  suspended: boolean;
  limitHalalas: number | null;
  termsDays: TermsDays | null;
  outstandingHalalas: number | null;
  overdueHalalas: number | null;
  latestPeriod: string | null;
  hasPendingVersion: boolean;
  openDispute: boolean;
  openClosure: boolean;
  openDefault: boolean;
  /** Counterparty's published score — only for side GIVEN (suppliers checking buyers). */
  counterpartyScore: ScoreBadge | null;
}

export interface LineVersionView {
  id: string;
  version: number;
  limitHalalas: number;
  termsDays: TermsDays;
  effectiveDate: string;
  attestation: string;
  status: VersionStatus;
  proposedAt: string;
  expiresAt: string;
  decidedAt: string | null;
  declineReason: string | null;
  lockedUntil: string | null;
}

export interface SnapshotView extends SnapshotInput {
  id: string;
  submittedAt: string;
  /** Held out of scoring until ops reviews (SPEC §4). */
  quarantined: boolean;
  quarantineReason: "OVERDUE_JUMP" | "OVER_LIMIT" | null;
  supplierNote: string | null;
  /** Ops rejected it as inaccurate; never scored. */
  rejected: boolean;
}

export interface AttachmentView {
  id: string;
  fileName: string;
  sizeBytes: number;
  url: string;
}

export interface DisputeView {
  id: string;
  status: DisputeStatus;
  reason: string;
  createdAt: string;
  respondBy: string;
  supplierResponse: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  attachments: AttachmentView[];
}

export interface ClosureView {
  id: string;
  status: ClosureStatus;
  reason: string;
  objection: string | null;
  createdAt: string;
  respondBy: string;
}

export interface DefaultView {
  id: string;
  status: DefaultStatus;
  amountHalalas: number;
  oldestDueDate: string;
  note: string;
  buyerReply: string | null;
  buyerReplyBy: string;
  decisionNote: string | null;
  alertSent: boolean | null;
  /** Supplier reported the default as settled (awaiting ops confirmation while status is UPHELD). */
  settledAt: string | null;
  createdAt: string;
  attachments: AttachmentView[];
}

export type LineAction =
  | "AMEND"
  | "CLOSE"
  | "SUBMIT_SNAPSHOT"
  | "FILE_DEFAULT"
  | "RESPOND_DISPUTE"
  | "RESPOND_CLOSURE"
  | "RETRACT_DEFAULT"
  | "MARK_DEFAULT_SETTLED"
  | "CONFIRM"
  | "DECLINE"
  | "DISPUTE"
  | "REQUEST_CLOSURE"
  | "REPLY_DEFAULT";

export interface LineDetail {
  line: LineSummary & { createdAt: string; confirmedAt: string | null; closedAt: string | null; closeReason: string | null; voidReason: string | null };
  supplier: CompanyRef;
  buyer: CompanyRef;
  versions: LineVersionView[];
  snapshots: SnapshotView[];
  disputes: DisputeView[];
  closures: ClosureView[];
  defaults: DefaultView[];
  /** What the current user may do right now (role, CFO, status and timers already applied). */
  actions: LineAction[];
  /** Why a dispute is not possible (e.g. window closed), as i18n key; null if allowed or not relevant. */
  disputeBlockedReason: string | null;
}

/* ───────────── Home, tasks, notifications ───────────── */

export type TaskKind =
  | "CONFIRM_LINE"
  | "CONFIRM_AMENDMENT"
  | "SNAPSHOT_DUE"
  | "RESPOND_DISPUTE"
  | "RESPOND_CLOSURE"
  | "REPLY_DEFAULT"
  | "NOMINATE_CFO"
  | "AWAIT_VERIFICATION"
  | "AWAIT_CFO_APPROVAL";

export interface TaskView {
  kind: TaskKind;
  /** i18n params (company names, TCL ids, counts) */
  params: Record<string, string | number>;
  href: string;
  dueAt: string | null;
  urgent: boolean;
}

export interface NotificationView {
  id: string;
  kind: string;
  params: Record<string, string | number>;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export interface BookTotals {
  activeLines: number;
  limitHalalas: number;
  outstandingHalalas: number;
  overdueHalalas: number;
}

export interface HomeData {
  tasks: TaskView[];
  alerts: NotificationView[];
  given: BookTotals;
  received: BookTotals;
  /** The viewer's own published network score (how suppliers see us). */
  myScore: ScoreCard | null;
  /** Buyers I supply whose light is RED or YELLOW, worst first (max 5). */
  watchlist: (CompanyRef & ScoreBadge & { outstandingHalalas: number })[];
}

/* ───────────── Company & team ───────────── */

export interface MemberView {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  title: string | null;
  isCfo: boolean;
}

export interface CfoView {
  id: string;
  userId: string;
  name: string;
  mobileMasked: string;
  title: string;
  status: CfoStatus;
  effectiveAt: string | null;
  createdAt: string;
}

export interface CompanyPage {
  company: NonNullable<SessionContext["company"]> & { createdAt: string; verifiedAt: string | null };
  members: MemberView[];
  activeCfo: CfoView | null;
  pendingCfo: CfoView | null;
  /** Invite links created this session are only shown once (also in the dev outbox). */
}

/* ───────────── Lookup & projects ───────────── */

export interface LookupResult {
  company: CompanyRef & { city: string; sector: string; status: CompanyStatus };
  /** Whether the viewer can open a new line to this company now, and why not. */
  canTag: boolean;
  cannotTagReason: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  location: string;
  companies: number;
  red: number;
  yellow: number;
}

export interface ProjectNode {
  companyId: string;
  name: string;
  tmcId: string;
  tier: 0 | 1 | 2 | 3;
  roleLabel: string | null;
  score: ScoreBadge | null;
  /** Paid by 2+ payers in this project → concentration risk badge. */
  shared: boolean;
}

export interface ProjectMap {
  id: string;
  name: string;
  location: string;
  nodes: ProjectNode[];
  links: { payer: string; payee: string }[];
}

/* ───────────── Ops ───────────── */

export interface OpsQueue {
  companies: (CompanyRef & { crNumber: string; city: string; sector: string; createdAt: string; ownerEmail: string })[];
  cfos: (CfoView & { company: CompanyRef; authorityDoc: AttachmentView | null })[];
  disputes: (DisputeView & { line: { id: string; tclId: string }; supplier: CompanyRef; buyer: CompanyRef })[];
  defaults: (DefaultView & { line: { id: string; tclId: string }; supplier: CompanyRef; buyer: CompanyRef })[];
  /** Quarantined snapshots awaiting review (SPEC §4). */
  snapshots: (SnapshotView & { line: { id: string; tclId: string }; supplier: CompanyRef; buyer: CompanyRef; previous: SnapshotView | null; limitHalalas: number })[];
}

export interface ReleaseView {
  id: string;
  period: string;
  runAt: string;
  companiesScored: number;
  companiesSuppressed: number;
}

export interface AuditView {
  id: number;
  at: string;
  actor: string | null;
  company: string | null;
  entityType: string;
  entityId: string;
  action: string;
  data: Record<string, unknown>;
}

export interface OutboxView {
  id: string;
  channel: "SMS" | "EMAIL";
  recipient: string;
  subject: string | null;
  body: string;
  status: "QUEUED" | "SENT" | "FAILED";
  createdAt: string;
}

export interface DemoPersona {
  email: string;
  name: string;
  /** i18n key describing what this persona demonstrates */
  storyKey: string;
  companyName: string | null;
  role: MemberRole | "STAFF";
  isCfo: boolean;
}

/* ───────────── Loader & action signatures ───────────── */

export interface Queries {
  /** null when signed out. Cached per request. */
  getSession(): Promise<SessionContext | null>;
  getHome(): Promise<HomeData>;
  listLines(side: Side, filter?: { status?: LineStatus | "ALL"; q?: string }): Promise<LineSummary[]>;
  getLine(lineId: string): Promise<LineDetail | null>;
  /** Lines needing this month's snapshot (supplier side), with last submitted values. */
  getSnapshotWorklist(): Promise<{ period: string; dueDate: string; lines: (LineSummary & { submitted: boolean })[] }>;
  /** Score card for any company by id (viewer must be VERIFIED; own company always allowed). */
  getScoreCard(companyId: string): Promise<ScoreCard | null>;
  listNotifications(): Promise<NotificationView[]>;
  getCompanyPage(): Promise<CompanyPage>;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectMap | null>;
  getOpsQueue(): Promise<OpsQueue>;
  listReleases(): Promise<ReleaseView[]>;
  listAudit(filter?: { entityId?: string; limit?: number }): Promise<AuditView[]>;
  listOutbox(): Promise<OutboxView[]>;
  listDemoPersonas(): Promise<DemoPersona[]>;
}

export interface NewLineInput {
  buyerCompanyId: string;
  limitSar: number;
  termsDays: TermsDays;
  effectiveDate: string;
}

export interface Actions {
  /* auth & onboarding (sign-in/up themselves go through Better Auth's client) */
  registerCompany(input: { legalName: string; legalNameAr?: string; crNumber: string; city: string; sector: string; title?: string }): Promise<ActionResult<{ tmcId: string }>>;
  demoSignIn(email: string): Promise<ActionResult>;
  setLocale(locale: "en" | "ar"): Promise<void>;

  /* team & CFO */
  inviteMember(input: { email: string; name: string; role: MemberRole; title?: string }): Promise<ActionResult<{ inviteUrl: string }>>;
  changeMemberRole(input: { userId: string; role: MemberRole }): Promise<ActionResult>;
  nominateCfo(form: FormData /* userId, mobile, title, document (file) */): Promise<ActionResult>;

  /* lines (supplier) */
  lookupCompany(q: string): Promise<ActionResult<LookupResult | null>>;
  createLine(input: NewLineInput): Promise<ActionResult<{ lineId: string; tclId: string }>>;
  amendLine(input: { lineId: string; limitSar: number; termsDays: TermsDays; effectiveDate: string }): Promise<ActionResult>;
  closeLine(input: { lineId: string; reason: string }): Promise<ActionResult>;
  /** If the quarantine rule fires and no `supplierNote` is given, returns error `errors.snapshotNeedsNote` with fieldErrors.supplierNote and saves nothing; resubmit with the note. */
  submitSnapshot(input: { lineId: string; supplierNote?: string } & SnapshotInput): Promise<ActionResult<{ quarantined: boolean }>>;
  uploadSnapshotsCsv(form: FormData /* file */): Promise<ActionResult<{ accepted: number; errors: { row: number; error: string }[] }>>;
  respondDispute(input: { disputeId: string; response: string }): Promise<ActionResult>;
  respondClosure(input: { closureId: string; accept: boolean; objection?: string }): Promise<ActionResult>;
  fileDefault(form: FormData /* lineId, amountSar, oldestDueDate, note, files[] */): Promise<ActionResult>;
  retractDefault(input: { defaultId: string }): Promise<ActionResult>;
  markDefaultSettled(input: { defaultId: string }): Promise<ActionResult>;

  /* lines (buyer CFO) */
  requestOtp(input: { versionId: string }): Promise<ActionResult<{ sentTo: string; expiresAt: string }>>;
  confirmVersion(input: { versionId: string; code: string }): Promise<ActionResult>;
  declineVersion(input: { versionId: string; reason?: string }): Promise<ActionResult>;
  /** Evidence file(s) always required (SPEC §2). */
  openDispute(form: FormData /* lineId, reason, files[] (≥ 1) */): Promise<ActionResult>;
  requestClosure(input: { lineId: string; reason: string }): Promise<ActionResult>;
  replyDefault(input: { defaultId: string; reply: string }): Promise<ActionResult>;

  /* notifications & projects */
  markNotificationsRead(ids?: string[]): Promise<ActionResult>;
  createProject(input: { name: string; location: string }): Promise<ActionResult<{ projectId: string }>>;
  addProjectMember(input: { projectId: string; q: string; tier: 0 | 1 | 2 | 3; roleLabel?: string }): Promise<ActionResult>;
  removeProjectMember(input: { projectId: string; companyId: string }): Promise<ActionResult>;
  addProjectLink(input: { projectId: string; payerCompanyId: string; payeeCompanyId: string }): Promise<ActionResult>;
  removeProjectLink(input: { projectId: string; payerCompanyId: string; payeeCompanyId: string }): Promise<ActionResult>;

  /* ops */
  verifyCompany(input: { companyId: string; approve: boolean; note?: string }): Promise<ActionResult>;
  decideCfo(input: { cfoId: string; approve: boolean; waiveCoolingOff?: boolean; note?: string }): Promise<ActionResult>;
  decideDispute(input: { disputeId: string; uphold: boolean; note: string }): Promise<ActionResult>;
  decideDefault(input: { defaultId: string; decision: "UPHOLD" | "REJECT" | "REQUEST_INFO"; note: string }): Promise<ActionResult>;
  confirmDefaultSettled(input: { defaultId: string }): Promise<ActionResult>;
  voidLine(input: { lineId: string; reason: string }): Promise<ActionResult>;
  /** Ops: suspend/unsuspend a line while reviewing an escalated dispute. */
  setLineSuspended(input: { lineId: string; suspended: boolean; note: string }): Promise<ActionResult>;
  /** Ops: release (counts from next release) or reject (never counts) a quarantined snapshot. */
  decideSnapshot(input: { snapshotId: string; release: boolean; note: string }): Promise<ActionResult>;
  runScoreRelease(input?: { period?: string }): Promise<ActionResult<ReleaseView>>;
  runTick(): Promise<ActionResult<Record<string, number>>>;
}
