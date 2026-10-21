import "server-only";
import { getDb } from "@tmc/db";
import { iso, num, rows } from "@tmc/db/jobs";
import { sql } from "drizzle-orm";
import type { AuditView, CompanyRef, OpsQueue, OutboxView, ReleaseView } from "../contracts";
import { toCfoView, type CfoRow } from "./company";
import {
  attachmentsByOwner,
  DEFAULT_COLUMNS,
  DISPUTE_COLUMNS,
  SNAPSHOT_COLUMNS,
  toDefaultView,
  toDisputeView,
  toSnapshotView,
  type DefaultRow,
  type DisputeRow,
  type SnapRow,
} from "./line-detail";

interface Parties {
  line_id: string;
  tcl_id: string;
  s_id: string;
  s_tmc: string;
  s_name: string;
  s_name_ar: string | null;
  b_id: string;
  b_tmc: string;
  b_name: string;
  b_name_ar: string | null;
}
const PARTIES = sql`l.id as line_id, l.tcl_id, ps.id as s_id, ps.tmc_id as s_tmc, ps.legal_name as s_name, ps.legal_name_ar as s_name_ar,
  pb.id as b_id, pb.tmc_id as b_tmc, pb.legal_name as b_name, pb.legal_name_ar as b_name_ar`;
const PARTY_JOINS = sql`join companies ps on ps.id = l.supplier_company_id join companies pb on pb.id = l.buyer_company_id`;
const parties = (p: Parties): { line: { id: string; tclId: string }; supplier: CompanyRef; buyer: CompanyRef } => ({
  line: { id: p.line_id, tclId: p.tcl_id },
  supplier: { id: p.s_id, tmcId: p.s_tmc, legalName: p.s_name, legalNameAr: p.s_name_ar },
  buyer: { id: p.b_id, tmcId: p.b_tmc, legalName: p.b_name, legalNameAr: p.b_name_ar },
});

/** Ops work queues (staff only; owner connection after the staff check). */
export async function opsQueue(): Promise<OpsQueue> {
  const db = getDb();
  const [companies, cfos, disputes, defaults, snapshots, atts] = await Promise.all([
    rows<{ id: string; tmc_id: string; legal_name: string; legal_name_ar: string | null; cr_number: string; city: string; sector: string; created_at: Date; owner_email: string | null }>(
      db,
      sql`select c.id, c.tmc_id, c.legal_name, c.legal_name_ar, c.cr_number, c.city, c.sector, c.created_at,
            (select u.email from memberships m join "user" u on u.id = m.user_id where m.company_id = c.id and m.role = 'OWNER' order by m.created_at limit 1) as owner_email
          from companies c where c.status = 'UNVERIFIED' order by c.created_at`,
    ),
    rows<CfoRow & { c_id: string; c_tmc: string; c_name: string; c_name_ar: string | null; doc_id: string | null; doc_name: string | null; doc_size: number | null }>(
      db,
      sql`select d.id, d.user_id, u.name, d.mobile, d.title, d.status, d.effective_at, d.created_at,
            c.id as c_id, c.tmc_id as c_tmc, c.legal_name as c_name, c.legal_name_ar as c_name_ar,
            a.id as doc_id, a.file_name as doc_name, a.size_bytes as doc_size
          from cfo_designations d join "user" u on u.id = d.user_id join companies c on c.id = d.company_id
          left join attachments a on a.id = d.authority_doc_id
          where d.status in ('NOMINATED', 'APPROVED') order by d.created_at`,
    ),
    rows<DisputeRow & Parties>(
      db,
      sql`select ${DISPUTE_COLUMNS}, ${PARTIES} from disputes d join credit_lines l on l.id = d.line_id ${PARTY_JOINS}
          where d.status in ('OPEN', 'RESPONDED', 'ESCALATED')
          order by (d.status = 'ESCALATED') desc, d.created_at`,
    ),
    rows<DefaultRow & Parties>(
      db,
      sql`select ${DEFAULT_COLUMNS}, ${PARTIES} from default_reports r join credit_lines l on l.id = r.line_id ${PARTY_JOINS}
          where r.status in ('UNDER_REVIEW', 'INFO_REQUESTED') or (r.status = 'UPHELD' and r.settled_at is not null)
          order by r.created_at`,
    ),
    rows<SnapRow & Parties & { limit_halalas: string; previous: SnapRow | null }>(
      db,
      sql`select ${SNAPSHOT_COLUMNS}, ${PARTIES}, v.limit_halalas,
            (select row_to_json(p) from (
               select x.id, x.period::text, x.outstanding, x.not_due, x.d1_30, x.d31_60, x.d61_90, x.d90_plus, x.settled_total,
                 x.settled_on_time, x.submitted_at, x.quarantined, x.quarantine_reason, x.supplier_note, x.rejected
               from snapshots x where x.line_id = s.line_id and x.period < s.period order by x.period desc limit 1) p) as previous
          from snapshots s join credit_lines l on l.id = s.line_id ${PARTY_JOINS}
          join credit_line_versions v on v.line_id = l.id and v.version = l.current_version
          where s.quarantined order by s.submitted_at`,
    ),
    rows<{ id: string; owner_id: string; file_name: string; size_bytes: number }>(
      db,
      sql`select a.id, a.owner_id, a.file_name, a.size_bytes from attachments a
          where a.owner_type in ('dispute', 'default') and a.owner_id in (
            select id from disputes where status in ('OPEN', 'RESPONDED', 'ESCALATED')
            union all select id from default_reports where status in ('UNDER_REVIEW', 'INFO_REQUESTED', 'UPHELD'))`,
    ),
  ]);
  const att = attachmentsByOwner(atts);
  return {
    companies: companies.map((c) => ({
      id: c.id,
      tmcId: c.tmc_id,
      legalName: c.legal_name,
      legalNameAr: c.legal_name_ar,
      crNumber: c.cr_number,
      city: c.city,
      sector: c.sector,
      createdAt: iso(c.created_at),
      ownerEmail: c.owner_email ?? "",
    })),
    cfos: cfos.map((c) => ({
      ...toCfoView(c),
      company: { id: c.c_id, tmcId: c.c_tmc, legalName: c.c_name, legalNameAr: c.c_name_ar },
      authorityDoc: c.doc_id ? { id: c.doc_id, fileName: c.doc_name!, sizeBytes: c.doc_size!, url: `/api/files/${c.doc_id}` } : null,
    })),
    disputes: disputes.map((d) => ({ ...toDisputeView(d, att), ...parties(d) })),
    defaults: defaults.map((r) => ({ ...toDefaultView(r, att), ...parties(r) })),
    snapshots: snapshots.map((s) => ({ ...toSnapshotView(s), ...parties(s), previous: s.previous ? toSnapshotView(s.previous) : null, limitHalalas: num(s.limit_halalas) })),
  };
}

export async function releaseList(): Promise<ReleaseView[]> {
  const list = await rows<{ id: string; period: string; run_at: Date; companies_scored: number; companies_suppressed: number }>(
    getDb(),
    sql`select id, period::text, run_at, companies_scored, companies_suppressed from score_releases order by period desc`,
  );
  return list.map((r) => ({ id: r.id, period: r.period, runAt: iso(r.run_at), companiesScored: r.companies_scored, companiesSuppressed: r.companies_suppressed }));
}

export async function auditList(filter: { entityId?: string; limit?: number }): Promise<AuditView[]> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const list = await rows<{ id: string; at: Date; actor: string | null; company: string | null; entity_type: string; entity_id: string; action: string; data: Record<string, unknown> }>(
    getDb(),
    sql`select a.id, a.at, u.email as actor, c.legal_name as company, a.entity_type, a.entity_id, a.action, a.data
        from audit_events a left join "user" u on u.id = a.actor_user_id left join companies c on c.id = a.company_id
        ${filter.entityId ? sql`where a.entity_id = ${filter.entityId}` : sql``}
        order by a.id desc limit ${limit}`,
  );
  return list.map((a) => ({ id: num(a.id), at: iso(a.at), actor: a.actor, company: a.company, entityType: a.entity_type, entityId: a.entity_id, action: a.action, data: a.data }));
}

export async function outboxList(): Promise<OutboxView[]> {
  const list = await rows<{ id: string; channel: "SMS" | "EMAIL"; recipient: string; subject: string | null; body: string; status: "QUEUED" | "SENT" | "FAILED"; created_at: Date }>(
    getDb(),
    sql`select id, channel, recipient, subject, body, status, created_at from outbox order by created_at desc limit 200`,
  );
  return list.map((o) => ({ id: o.id, channel: o.channel, recipient: o.recipient, subject: o.subject, body: o.body, status: o.status, createdAt: iso(o.created_at) }));
}
