import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
/** Money is always integer halalas (SAR x 100). */
const money = (name: string) => bigint(name, { mode: "number" });

/* ───────────── Better Auth (users, sessions) ───────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ───────────── Enums ───────────── */

export const companyStatus = pgEnum("company_status", ["UNVERIFIED", "VERIFIED", "SUSPENDED"]);
export const memberRole = pgEnum("member_role", ["OWNER", "ADMIN", "CREDIT_MANAGER", "VIEWER"]);
export const cfoStatus = pgEnum("cfo_status", ["NOMINATED", "APPROVED", "ACTIVE", "REJECTED", "ENDED"]);
export const lineStatus = pgEnum("line_status", ["PENDING", "ACTIVE", "DECLINED", "EXPIRED", "CLOSED", "VOIDED"]);
export const versionStatus = pgEnum("version_status", ["PENDING", "CONFIRMED", "DECLINED", "EXPIRED", "SUPERSEDED"]);
export const disputeStatus = pgEnum("dispute_status", ["OPEN", "RESPONDED", "SUSPENDED", "REJECTED", "UPHELD"]);
export const closureStatus = pgEnum("closure_status", ["OPEN", "ACCEPTED", "OBJECTED", "AUTO_CLOSED"]);
export const defaultStatus = pgEnum("default_status", [
  "UNDER_REVIEW",
  "INFO_REQUESTED",
  "UPHELD",
  "REJECTED",
  "RETRACTED",
  "SETTLED",
]);
export const notificationKind = pgEnum("notification_kind", [
  "LINE_CONFIRMATION_REQUESTED",
  "LINE_CONFIRMED",
  "LINE_DECLINED",
  "LINE_EXPIRED",
  "LINE_CLOSED",
  "LINE_VOIDED",
  "AMENDMENT_REQUESTED",
  "CLOSURE_REQUESTED",
  "DISPUTE_OPENED",
  "DISPUTE_DECIDED",
  "DEFAULT_FILED",
  "DEFAULT_DECIDED",
  "NETWORK_ALERT",
  "NETWORK_ALERT_RESOLVED",
  "COMPANY_VERIFIED",
  "CFO_ACTIVE",
  "SCORE_RELEASED",
]);
export const outboxChannel = pgEnum("outbox_channel", ["SMS", "EMAIL"]);
export const outboxStatus = pgEnum("outbox_status", ["QUEUED", "SENT", "FAILED"]);

/* ───────────── Companies & people ───────────── */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmcId: text("tmc_id").notNull().unique(),
    legalName: text("legal_name").notNull(),
    legalNameAr: text("legal_name_ar"),
    crNumber: text("cr_number").notNull().unique(),
    country: text("country").notNull().default("SA"),
    city: text("city").notNull(),
    sector: text("sector").notNull(),
    status: companyStatus("status").notNull().default("UNVERIFIED"),
    verifiedAt: ts("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [check("cr_number_format", sql`${t.crNumber} ~ '^[0-9]{10}$'`)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: text("user_id")
      .notNull()
      .unique() // one user belongs to one company (A9)
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    title: text("title"),
    createdAt: createdAt(),
  },
  (t) => [index("memberships_company_idx").on(t.companyId)],
);

/** Platform operations staff (verification, disputes, defaults, releases). */
export const staff = pgTable("staff", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const cfoDesignations = pgTable(
  "cfo_designations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    mobile: text("mobile").notNull(),
    title: text("title").notNull(),
    authorityDocId: uuid("authority_doc_id"),
    status: cfoStatus("status").notNull().default("NOMINATED"),
    /** When an APPROVED nomination becomes ACTIVE (end of 48 h cooling-off, or now if waived). */
    effectiveAt: ts("effective_at"),
    nominatedBy: text("nominated_by").notNull(),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    decisionNote: text("decision_note"),
    endedAt: ts("ended_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("one_active_cfo_per_company").on(t.companyId).where(sql`${t.status} = 'ACTIVE'`),
    uniqueIndex("one_open_cfo_nomination_per_company")
      .on(t.companyId)
      .where(sql`${t.status} in ('NOMINATED', 'APPROVED')`),
    check("cfo_mobile_format", sql`${t.mobile} ~ '^\\+9665[0-9]{8}$'`),
  ],
);

/* ───────────── Credit lines ───────────── */

export const creditLines = pgTable(
  "credit_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tclId: text("tcl_id").notNull().unique(),
    supplierCompanyId: uuid("supplier_company_id")
      .notNull()
      .references(() => companies.id),
    buyerCompanyId: uuid("buyer_company_id")
      .notNull()
      .references(() => companies.id),
    status: lineStatus("status").notNull().default("PENDING"),
    /** Version number currently in force (null until first confirmation). */
    currentVersion: integer("current_version"),
    /** Excluded from calculations while a dispute awaits ops after supplier silence. */
    suspended: boolean("suspended").notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    confirmedAt: ts("confirmed_at"),
    closedAt: ts("closed_at"),
    closeReason: text("close_reason"),
    voidedAt: ts("voided_at"),
    voidReason: text("void_reason"),
  },
  (t) => [
    check("line_parties_differ", sql`${t.supplierCompanyId} <> ${t.buyerCompanyId}`),
    uniqueIndex("one_open_line_per_pair")
      .on(t.supplierCompanyId, t.buyerCompanyId)
      .where(sql`${t.status} in ('PENDING', 'ACTIVE')`),
    index("lines_supplier_idx").on(t.supplierCompanyId),
    index("lines_buyer_idx").on(t.buyerCompanyId),
  ],
);

export const creditLineVersions = pgTable(
  "credit_line_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => creditLines.id),
    version: integer("version").notNull(),
    limitHalalas: money("limit_halalas").notNull(),
    termsDays: smallint("terms_days").notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    attestation: text("attestation").notNull(),
    status: versionStatus("status").notNull().default("PENDING"),
    proposedBy: text("proposed_by").notNull(),
    proposedAt: ts("proposed_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    declineReason: text("decline_reason"),
    /** Confirmation locked until this time after repeated failed OTPs. */
    lockedUntil: ts("locked_until"),
    failedCodes: smallint("failed_codes").notNull().default(0),
  },
  (t) => [
    uniqueIndex("line_version_unique").on(t.lineId, t.version),
    uniqueIndex("one_pending_version_per_line").on(t.lineId).where(sql`${t.status} = 'PENDING'`),
    check("limit_range", sql`${t.limitHalalas} between 1000000 and 50000000000`),
    check("terms_allowed", sql`${t.termsDays} in (30, 45, 60, 90, 120)`),
  ],
);

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => creditLineVersions.id),
    cfoUserId: text("cfo_user_id").notNull(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    attempts: smallint("attempts").notNull().default(0),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_version_idx").on(t.versionId, t.createdAt)],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => creditLines.id),
    /** First day of the reported month. */
    period: date("period", { mode: "string" }).notNull(),
    outstanding: money("outstanding").notNull(),
    notDue: money("not_due").notNull(),
    d1_30: money("d1_30").notNull(),
    d31_60: money("d31_60").notNull(),
    d61_90: money("d61_90").notNull(),
    d90Plus: money("d90_plus").notNull(),
    settledTotal: money("settled_total").notNull(),
    settledOnTime: money("settled_on_time").notNull(),
    submittedBy: text("submitted_by").notNull(),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("snapshot_line_period").on(t.lineId, t.period),
    check("snapshot_period_first_of_month", sql`extract(day from ${t.period}) = 1`),
    check(
      "snapshot_non_negative",
      sql`${t.outstanding} >= 0 and ${t.notDue} >= 0 and ${t.d1_30} >= 0 and ${t.d31_60} >= 0 and ${t.d61_90} >= 0 and ${t.d90Plus} >= 0 and ${t.settledTotal} >= 0 and ${t.settledOnTime} >= 0`,
    ),
    check(
      "snapshot_buckets_sum",
      sql`${t.notDue} + ${t.d1_30} + ${t.d31_60} + ${t.d61_90} + ${t.d90Plus} = ${t.outstanding}`,
    ),
    check("snapshot_on_time_le_total", sql`${t.settledOnTime} <= ${t.settledTotal}`),
  ],
);

/* ───────────── Disputes, closures, defaults ───────────── */

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => creditLines.id),
    raisedBy: text("raised_by").notNull(),
    reason: text("reason").notNull(),
    status: disputeStatus("status").notNull().default("OPEN"),
    respondBy: ts("respond_by").notNull(),
    supplierResponse: text("supplier_response"),
    respondedBy: text("responded_by"),
    respondedAt: ts("responded_at"),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("one_open_dispute_per_line")
      .on(t.lineId)
      .where(sql`${t.status} in ('OPEN', 'RESPONDED', 'SUSPENDED')`),
  ],
);

export const closureRequests = pgTable(
  "closure_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => creditLines.id),
    requestedBy: text("requested_by").notNull(),
    reason: text("reason").notNull(),
    status: closureStatus("status").notNull().default("OPEN"),
    respondBy: ts("respond_by").notNull(),
    objection: text("objection"),
    resolvedBy: text("resolved_by"),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("one_open_closure_per_line").on(t.lineId).where(sql`${t.status} = 'OPEN'`)],
);

export const defaultReports = pgTable(
  "default_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => creditLines.id),
    reportedBy: text("reported_by").notNull(),
    amountHalalas: money("amount_halalas").notNull(),
    oldestDueDate: date("oldest_due_date", { mode: "string" }).notNull(),
    note: text("note").notNull(),
    status: defaultStatus("status").notNull().default("UNDER_REVIEW"),
    buyerReply: text("buyer_reply"),
    buyerReplyBy: ts("buyer_reply_by").notNull(),
    buyerRepliedAt: ts("buyer_replied_at"),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    decisionNote: text("decision_note"),
    /** Whether the network alert went out on uphold (false when buyer was below the privacy floor). */
    alertSent: boolean("alert_sent"),
    settledAt: ts("settled_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("default_amount_positive", sql`${t.amountHalalas} > 0`),
    index("defaults_line_idx").on(t.lineId),
  ],
);

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** Uploaded evidence / authority documents (PDF, PNG, JPG; max 5 MB), stored in Postgres so deploys need no file storage. */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    /** 'cfo' | 'dispute' | 'default' */
    ownerType: text("owner_type").notNull(),
    ownerId: uuid("owner_id"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    content: bytea("content").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("attachments_owner_idx").on(t.ownerType, t.ownerId),
    check("attachment_size", sql`${t.sizeBytes} between 1 and 5242880`),
  ],
);

/* ───────────── Scores ───────────── */

export const scoreReleases = pgTable("score_releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Month the release covers (first day). */
  period: date("period", { mode: "string" }).notNull().unique(),
  runAt: ts("run_at").notNull().defaultNow(),
  runBy: text("run_by"),
  companiesScored: integer("companies_scored").notNull().default(0),
  companiesSuppressed: integer("companies_suppressed").notNull().default(0),
});

export const buyerScores = pgTable(
  "buyer_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => scoreReleases.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    published: boolean("published").notNull(),
    /** Why outputs are hidden: 'BELOW_FLOOR' | 'NO_PAYMENT_DATA' (null when published). */
    suppressedReason: text("suppressed_reason"),
    frozen: boolean("frozen").notNull().default(false),
    score: smallint("score"),
    band: text("band"),
    light: text("light"),
    behaviour: text("behaviour"),
    confidence: text("confidence"),
    exposureBand: text("exposure_band"),
    supplierBand: text("supplier_band"),
    /** Factor values, weights, caps and reasons (see @tmc/domain ScoreResult). */
    explanation: jsonb("explanation"),
    /** Sorted eligible supplier ids hash, for the cohort freeze. Never shown. */
    cohortHash: text("cohort_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("score_release_company").on(t.releaseId, t.companyId),
    index("scores_company_idx").on(t.companyId, t.createdAt),
  ],
);

/* ───────────── Supply-chain projects ───────────── */

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerCompanyId: uuid("owner_company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(),
  location: text("location").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    tier: smallint("tier").notNull(),
    roleLabel: text("role_label"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.companyId] }), check("tier_range", sql`${t.tier} between 0 and 3`)],
);

export const projectLinks = pgTable(
  "project_links",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    payerCompanyId: uuid("payer_company_id")
      .notNull()
      .references(() => companies.id),
    payeeCompanyId: uuid("payee_company_id")
      .notNull()
      .references(() => companies.id),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.payerCompanyId, t.payeeCompanyId] }),
    check("link_parties_differ", sql`${t.payerCompanyId} <> ${t.payeeCompanyId}`),
  ],
);

/* ───────────── Notifications, messages, audit ───────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    kind: notificationKind("kind").notNull(),
    /** Display data only (names, ids). Never another supplier's identity or amounts. */
    payload: jsonb("payload").notNull().default({}),
    lineId: uuid("line_id"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_company_idx").on(t.companyId, t.createdAt)],
);

/** Every SMS/email. Locally shown in the dev outbox; in production sent by the worker. */
export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: outboxChannel("channel").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    status: outboxStatus("status").notNull().default("QUEUED"),
    error: text("error"),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
  },
  (t) => [index("outbox_created_idx").on(t.createdAt)],
);

/** Append-only. The app role may only INSERT (enforced in SQL migration). */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    actorUserId: text("actor_user_id"),
    companyId: uuid("company_id"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    data: jsonb("data").notNull().default({}),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_company_idx").on(t.companyId, t.at)],
);
