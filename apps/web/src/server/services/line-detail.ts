import "server-only";
import type { Tx } from "@tmc/db";
import { iso, isoOrNull, num, rows } from "@tmc/db/jobs";
import { lineActions, type ClosureStatus, type DefaultStatus, type DisputeStatus, type TermsDays, type VersionStatus } from "@tmc/domain";
import { sql } from "drizzle-orm";
import type { AttachmentView, LineDetail, SnapshotView } from "../contracts";
import type { Member } from "../guard";
import { lineSummaries, loadLineFacts } from "./lines";

export const attachmentUrl = (id: string) => `/api/files/${id}`;

interface AttRow {
  id: string;
  owner_id: string;
  file_name: string;
  size_bytes: number;
}

export function attachmentsByOwner(list: AttRow[]): Map<string, AttachmentView[]> {
  const map = new Map<string, AttachmentView[]>();
  for (const a of list) {
    const views = map.get(a.owner_id) ?? [];
    views.push({ id: a.id, fileName: a.file_name, sizeBytes: a.size_bytes, url: attachmentUrl(a.id) });
    map.set(a.owner_id, views);
  }
  return map;
}

export interface SnapRow {
  id: string;
  period: string;
  outstanding: string;
  not_due: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  settled_total: string;
  settled_on_time: string;
  submitted_at: Date;
  quarantined: boolean;
  quarantine_reason: "OVERDUE_JUMP" | "OVER_LIMIT" | null;
  supplier_note: string | null;
  rejected: boolean;
}

export const SNAPSHOT_COLUMNS = sql`s.id, s.period::text, s.outstanding, s.not_due, s.d1_30, s.d31_60, s.d61_90, s.d90_plus, s.settled_total,
  s.settled_on_time, s.submitted_at, s.quarantined, s.quarantine_reason, s.supplier_note, s.rejected`;

export const toSnapshotView = (s: SnapRow): SnapshotView => ({
  id: s.id,
  period: s.period,
  outstanding: num(s.outstanding),
  notDue: num(s.not_due),
  d1_30: num(s.d1_30),
  d31_60: num(s.d31_60),
  d61_90: num(s.d61_90),
  d90Plus: num(s.d90_plus),
  settledTotal: num(s.settled_total),
  settledOnTime: num(s.settled_on_time),
  submittedAt: iso(s.submitted_at),
  quarantined: s.quarantined,
  quarantineReason: s.quarantine_reason,
  supplierNote: s.supplier_note,
  rejected: s.rejected,
});

export interface DisputeRow {
  id: string;
  status: DisputeStatus;
  reason: string;
  created_at: Date;
  respond_by: Date;
  supplier_response: string | null;
  decision_note: string | null;
  decided_at: Date | null;
}
export const DISPUTE_COLUMNS = sql`d.id, d.status, d.reason, d.created_at, d.respond_by, d.supplier_response, d.decision_note, d.decided_at`;
export const toDisputeView = (d: DisputeRow, att: Map<string, AttachmentView[]>) => ({
  id: d.id,
  status: d.status,
  reason: d.reason,
  createdAt: iso(d.created_at),
  respondBy: iso(d.respond_by),
  supplierResponse: d.supplier_response,
  decisionNote: d.decision_note,
  decidedAt: isoOrNull(d.decided_at),
  attachments: att.get(d.id) ?? [],
});

export interface DefaultRow {
  id: string;
  status: DefaultStatus;
  amount_halalas: string;
  oldest_due_date: string;
  note: string;
  buyer_reply: string | null;
  buyer_reply_by: Date;
  decision_note: string | null;
  alert_sent: boolean | null;
  settled_at: Date | null;
  created_at: Date;
}
export const DEFAULT_COLUMNS = sql`r.id, r.status, r.amount_halalas, r.oldest_due_date::text, r.note, r.buyer_reply, r.buyer_reply_by,
  r.decision_note, r.alert_sent, r.settled_at, r.created_at`;
export const toDefaultView = (r: DefaultRow, att: Map<string, AttachmentView[]>) => ({
  id: r.id,
  status: r.status,
  amountHalalas: num(r.amount_halalas),
  oldestDueDate: r.oldest_due_date,
  note: r.note,
  buyerReply: r.buyer_reply,
  buyerReplyBy: iso(r.buyer_reply_by),
  decisionNote: r.decision_note,
  alertSent: r.alert_sent,
  settledAt: isoOrNull(r.settled_at),
  createdAt: iso(r.created_at),
  attachments: att.get(r.id) ?? [],
});

/** Full line page for a party to the line (RLS-scoped transaction). */
export async function lineDetail(tx: Tx, viewer: Member, lineId: string, now: Date): Promise<LineDetail | null> {
  const [summary] = await lineSummaries(tx, viewer.company.id, { lineId });
  if (!summary) return null;
  const [facts, versions, snaps, disputes, closures, defaults, atts] = await Promise.all([
    loadLineFacts(tx, lineId),
    rows<{
      id: string;
      version: number;
      limit_halalas: string;
      terms_days: number;
      effective_date: string;
      attestation: string;
      status: VersionStatus;
      proposed_at: Date;
      expires_at: Date;
      decided_at: Date | null;
      decline_reason: string | null;
      locked_until: Date | null;
    }>(
      tx,
      sql`select id, version, limit_halalas, terms_days, effective_date::text, attestation, status, proposed_at, expires_at, decided_at,
            decline_reason, locked_until from credit_line_versions where line_id = ${lineId} order by version desc`,
    ),
    rows<SnapRow>(tx, sql`select ${SNAPSHOT_COLUMNS} from snapshots s where s.line_id = ${lineId} order by s.period desc`),
    rows<DisputeRow>(tx, sql`select ${DISPUTE_COLUMNS} from disputes d where d.line_id = ${lineId} order by d.created_at desc`),
    rows<{ id: string; status: ClosureStatus; reason: string; objection: string | null; created_at: Date; respond_by: Date }>(
      tx,
      sql`select id, status, reason, objection, created_at, respond_by from closure_requests where line_id = ${lineId} order by created_at desc`,
    ),
    rows<DefaultRow>(tx, sql`select ${DEFAULT_COLUMNS} from default_reports r where r.line_id = ${lineId} order by r.created_at desc`),
    rows<AttRow>(
      tx,
      sql`select a.id, a.owner_id, a.file_name, a.size_bytes from attachments a
          where a.owner_id in (select id from disputes where line_id = ${lineId} union all select id from default_reports where line_id = ${lineId})
          order by a.created_at`,
    ),
  ]);
  const att = attachmentsByOwner(atts);
  const { actions, disputeBlockedReason } = lineActions(
    facts!,
    { side: summary.side === "GIVEN" ? "SUPPLIER" : "BUYER", role: viewer.role, isCfo: viewer.cfo !== null, companyStatus: viewer.company.status },
    now,
  );
  const { supplier, buyer, ...line } = summary;
  return {
    line,
    supplier,
    buyer,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      limitHalalas: num(v.limit_halalas),
      termsDays: v.terms_days as TermsDays,
      effectiveDate: v.effective_date,
      attestation: v.attestation,
      status: v.status,
      proposedAt: iso(v.proposed_at),
      expiresAt: iso(v.expires_at),
      decidedAt: isoOrNull(v.decided_at),
      declineReason: v.decline_reason,
      lockedUntil: isoOrNull(v.locked_until),
    })),
    snapshots: snaps.map(toSnapshotView),
    disputes: disputes.map((d) => toDisputeView(d, att)),
    closures: closures.map((c) => ({ id: c.id, status: c.status, reason: c.reason, objection: c.objection, createdAt: iso(c.created_at), respondBy: iso(c.respond_by) })),
    defaults: defaults.map((r) => toDefaultView(r, att)),
    actions,
    disputeBlockedReason: actions.includes("DISPUTE") || summary.side === "GIVEN" || !viewer.cfo ? null : disputeBlockedReason,
  };
}
