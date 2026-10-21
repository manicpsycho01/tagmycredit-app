import "server-only";
import type { Executor } from "@tmc/db/jobs";
import { iso, isoOrNull, num, rows } from "@tmc/db/jobs";
import type { DefaultStatus, DisputeStatus, LineFacts, LineStatus, TermsDays } from "@tmc/domain";
import { sql, type SQL } from "drizzle-orm";
import type { CompanyRef, LineSummary, Side } from "../contracts";
import { badge, LATEST_SCORES } from "./scores";

export interface LineRow {
  id: string;
  tcl_id: string;
  status: LineStatus;
  suspended: boolean;
  created_at: Date;
  confirmed_at: Date | null;
  closed_at: Date | null;
  close_reason: string | null;
  void_reason: string | null;
  s_id: string;
  s_tmc: string;
  s_name: string;
  s_name_ar: string | null;
  b_id: string;
  b_tmc: string;
  b_name: string;
  b_name_ar: string | null;
  limit_halalas: string | null;
  terms_days: number | null;
  latest_period: string | null;
  outstanding: string | null;
  not_due: string | null;
  has_pending: boolean;
  open_dispute: boolean;
  open_closure: boolean;
  open_default: boolean;
  sc_published: boolean | null;
  sc_score: number | null;
  sc_band: string | null;
  sc_light: string | null;
}

export type LineSummaryFull = LineSummary & {
  supplier: CompanyRef;
  buyer: CompanyRef;
  createdAt: string;
  confirmedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  voidReason: string | null;
};

export interface LineFilter {
  side?: Side;
  lineId?: string;
  status?: LineStatus | "ALL";
  q?: string;
}

/** Credit lines the company is party to, with counterparty, terms in force, latest snapshot and the buyer's badge. */
export async function lineSummaries(ex: Executor, companyId: string, f: LineFilter = {}): Promise<LineSummaryFull[]> {
  const where: SQL[] = [sql`${companyId}::uuid in (l.supplier_company_id, l.buyer_company_id)`];
  if (f.side === "GIVEN") where.push(sql`l.supplier_company_id = ${companyId}`);
  if (f.side === "RECEIVED") where.push(sql`l.buyer_company_id = ${companyId}`);
  if (f.lineId) where.push(sql`l.id = ${f.lineId}`);
  if (f.status && f.status !== "ALL") where.push(sql`l.status = ${f.status}`);
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(sql`(l.tcl_id ilike ${like} or (case when l.supplier_company_id = ${companyId} then b.legal_name else s.legal_name end) ilike ${like}
      or (case when l.supplier_company_id = ${companyId} then b.tmc_id else s.tmc_id end) ilike ${like})`);
  }
  const list = await rows<LineRow>(
    ex,
    sql`select l.id, l.tcl_id, l.status, l.suspended, l.created_at, l.confirmed_at, l.closed_at, l.close_reason, l.void_reason,
          s.id as s_id, s.tmc_id as s_tmc, s.legal_name as s_name, s.legal_name_ar as s_name_ar,
          b.id as b_id, b.tmc_id as b_tmc, b.legal_name as b_name, b.legal_name_ar as b_name_ar,
          v.limit_halalas, v.terms_days, ls.period::text as latest_period, ls.outstanding, ls.not_due,
          exists (select 1 from credit_line_versions pv where pv.line_id = l.id and pv.status = 'PENDING') as has_pending,
          exists (select 1 from disputes d where d.line_id = l.id and d.status in ('OPEN', 'RESPONDED', 'ESCALATED')) as open_dispute,
          exists (select 1 from closure_requests c where c.line_id = l.id and c.status = 'OPEN') as open_closure,
          exists (select 1 from default_reports r where r.line_id = l.id and r.status in ('UNDER_REVIEW', 'INFO_REQUESTED', 'UPHELD')) as open_default,
          sc.published as sc_published, sc.score as sc_score, sc.band as sc_band, sc.light as sc_light
        from credit_lines l
        join companies s on s.id = l.supplier_company_id
        join companies b on b.id = l.buyer_company_id
        left join credit_line_versions v on v.line_id = l.id and v.version = l.current_version
        left join lateral (select period, outstanding, not_due from snapshots where line_id = l.id and not rejected order by period desc limit 1) ls on true
        left join ${LATEST_SCORES} sc on sc.company_id = l.buyer_company_id
        where ${sql.join(where, sql` and `)}
        order by l.created_at desc`,
  );
  return list.map((r) => toSummary(r, companyId));
}

const ref = (id: string, tmcId: string, legalName: string, legalNameAr: string | null): CompanyRef => ({ id, tmcId, legalName, legalNameAr });

function toSummary(r: LineRow, companyId: string): LineSummaryFull {
  const side: Side = r.s_id === companyId ? "GIVEN" : "RECEIVED";
  const supplier = ref(r.s_id, r.s_tmc, r.s_name, r.s_name_ar);
  const buyer = ref(r.b_id, r.b_tmc, r.b_name, r.b_name_ar);
  const outstanding = r.outstanding === null ? null : num(r.outstanding);
  return {
    id: r.id,
    tclId: r.tcl_id,
    side,
    counterparty: side === "GIVEN" ? buyer : supplier,
    status: r.status,
    suspended: r.suspended,
    limitHalalas: r.limit_halalas === null ? null : num(r.limit_halalas),
    termsDays: r.terms_days as TermsDays | null,
    outstandingHalalas: outstanding,
    overdueHalalas: outstanding === null ? null : outstanding - num(r.not_due),
    latestPeriod: r.latest_period,
    hasPendingVersion: r.has_pending,
    openDispute: r.open_dispute,
    openClosure: r.open_closure,
    openDefault: r.open_default,
    counterpartyScore: side === "GIVEN" ? badge({ published: r.sc_published, score: r.sc_score, band: r.sc_band, light: r.sc_light }) : null,
    supplier,
    buyer,
    createdAt: iso(r.created_at),
    confirmedAt: isoOrNull(r.confirmed_at),
    closedAt: isoOrNull(r.closed_at),
    closeReason: r.close_reason,
    voidReason: r.void_reason,
  };
}

interface FactsRow {
  supplier_company_id: string;
  buyer_company_id: string;
  tcl_id: string;
  status: LineStatus;
  pv_id: string | null;
  pv_version: number | null;
  pv_expires: Date | null;
  pv_locked: Date | null;
  dispute_id: string | null;
  dispute_status: DisputeStatus | null;
  closure_id: string | null;
  od_id: string | null;
  od_status: DefaultStatus | null;
  od_replied: boolean | null;
  od_reply_by: Date | null;
  ud_id: string | null;
  ud_claimed: boolean | null;
  d90: string;
  last_event: Date | null;
  last_rejected: Date | null;
}

export type LoadedFacts = LineFacts & {
  supplierId: string;
  buyerId: string;
  tclId: string;
  pendingVersionId: string | null;
  openDisputeId: string | null;
  openClosureId: string | null;
  openDefaultId: string | null;
  upheldDefaultId: string | null;
};

/** The state that decides allowed actions (domain `lineActions`), in one query. */
export async function loadLineFacts(ex: Executor, lineId: string, forUpdate = false): Promise<LoadedFacts | null> {
  const [r] = await rows<FactsRow>(
    ex,
    sql`select l.supplier_company_id, l.buyer_company_id, l.tcl_id, l.status,
          pv.id as pv_id, pv.version as pv_version, pv.expires_at as pv_expires, pv.locked_until as pv_locked,
          d.id as dispute_id, d.status as dispute_status,
          (select c.id from closure_requests c where c.line_id = l.id and c.status = 'OPEN') as closure_id,
          od.id as od_id, od.status as od_status, od.buyer_reply is not null as od_replied, od.buyer_reply_by as od_reply_by,
          ud.id as ud_id, ud.settled_at is not null as ud_claimed,
          coalesce((select s.d90_plus from snapshots s where s.line_id = l.id and not s.rejected order by s.period desc limit 1), 0) as d90,
          greatest(
            (select max(v.decided_at) from credit_line_versions v where v.line_id = l.id
               and (v.status = 'CONFIRMED' or (v.status = 'SUPERSEDED' and v.version <= coalesce(l.current_version, 0)))),
            (select max(s.submitted_at) from snapshots s where s.line_id = l.id)) as last_event,
          (select max(x.decided_at) from disputes x where x.line_id = l.id and x.status = 'REJECTED') as last_rejected
        from credit_lines l
        left join credit_line_versions pv on pv.line_id = l.id and pv.status = 'PENDING'
        left join disputes d on d.line_id = l.id and d.status in ('OPEN', 'RESPONDED', 'ESCALATED')
        left join lateral (select * from default_reports r where r.line_id = l.id and r.status in ('UNDER_REVIEW', 'INFO_REQUESTED') order by r.created_at desc limit 1) od on true
        left join lateral (select * from default_reports r where r.line_id = l.id and r.status = 'UPHELD' order by r.created_at desc limit 1) ud on true
        where l.id = ${lineId}
        ${forUpdate ? sql`for update of l` : sql``}`,
  );
  if (!r) return null;
  return {
    supplierId: r.supplier_company_id,
    buyerId: r.buyer_company_id,
    tclId: r.tcl_id,
    status: r.status,
    pendingVersionId: r.pv_id,
    pendingVersion: r.pv_id ? { version: r.pv_version!, expiresAt: new Date(r.pv_expires!), lockedUntil: r.pv_locked ? new Date(r.pv_locked) : null } : null,
    openDisputeId: r.dispute_id,
    openDispute: r.dispute_status ? { status: r.dispute_status } : null,
    openClosureId: r.closure_id,
    openClosure: r.closure_id !== null,
    openDefaultId: r.od_id,
    openDefault: r.od_id ? { status: r.od_status!, buyerReplied: r.od_replied === true, buyerReplyBy: new Date(r.od_reply_by!) } : null,
    upheldDefaultId: r.ud_id,
    upheldDefault: r.ud_id ? { settlementClaimed: r.ud_claimed === true } : null,
    latestD90Plus: num(r.d90),
    lastDisputableEventAt: r.last_event ? new Date(r.last_event) : null,
    lastRejectedDisputeAt: r.last_rejected ? new Date(r.last_rejected) : null,
  };
}
