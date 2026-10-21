import "server-only";
import type { Tx } from "@tmc/db";
import { hrefs, iso, isoOrNull, rows } from "@tmc/db/jobs";
import { addDays, canManageLines, canManageTeam, reportingPeriod, snapshotDueAt, URGENT_WITHIN_DAYS } from "@tmc/domain";
import { sql } from "drizzle-orm";
import type { BookTotals, HomeData, NotificationView, TaskView } from "../contracts";
import type { Member } from "../guard";
import { lineSummaries, type LineSummaryFull } from "./lines";
import { scoreCard } from "./scores";

const urgent = (due: Date, now: Date) => due <= addDays(now, URGENT_WITHIN_DAYS);

interface NotificationRow {
  id: string;
  kind: string;
  payload: { params?: Record<string, string | number>; href?: string | null };
  read_at: Date | null;
  created_at: Date;
}

export async function notificationsFor(tx: Tx, companyId: string, opts: { unreadOnly?: boolean; limit: number }): Promise<NotificationView[]> {
  const list = await rows<NotificationRow>(
    tx,
    sql`select id, kind, payload, read_at, created_at from notifications
        where company_id = ${companyId} ${opts.unreadOnly ? sql`and read_at is null` : sql``}
        order by created_at desc limit ${opts.limit}`,
  );
  return list.map((n) => ({
    id: n.id,
    kind: n.kind,
    params: n.payload.params ?? {},
    href: n.payload.href ?? null,
    read: n.read_at !== null,
    createdAt: iso(n.created_at),
  }));
}

function totals(lines: LineSummaryFull[]): BookTotals {
  const active = lines.filter((l) => l.status === "ACTIVE");
  return {
    activeLines: active.length,
    limitHalalas: active.reduce((a, l) => a + (l.limitHalalas ?? 0), 0),
    outstandingHalalas: active.reduce((a, l) => a + (l.outstandingHalalas ?? 0), 0),
    overdueHalalas: active.reduce((a, l) => a + (l.overdueHalalas ?? 0), 0),
  };
}

interface TaskRow {
  kind: "VERSION" | "DISPUTE" | "CLOSURE" | "DEFAULT" | "SNAPSHOT" | "CFO";
  line_id: string | null;
  tcl_id: string | null;
  party: string | null;
  version: number | null;
  due_at: Date | null;
  n: number | null;
}

/** "Needs you" tasks, filtered by what this member may act on. */
async function tasksFor(tx: Tx, v: Member, now: Date): Promise<TaskView[]> {
  const me = v.company.id;
  const period = reportingPeriod(now);
  const list = await rows<TaskRow>(
    tx,
    sql`select 'VERSION' as kind, l.id as line_id, l.tcl_id, s.legal_name as party, pv.version, pv.expires_at as due_at, null::int as n
          from credit_line_versions pv join credit_lines l on l.id = pv.line_id join companies s on s.id = l.supplier_company_id
          where l.buyer_company_id = ${me} and pv.status = 'PENDING' and pv.expires_at > ${now}
        union all
        select 'DISPUTE', l.id, l.tcl_id, b.legal_name, null, d.respond_by, null
          from disputes d join credit_lines l on l.id = d.line_id join companies b on b.id = l.buyer_company_id
          where l.supplier_company_id = ${me} and d.status = 'OPEN'
        union all
        select 'CLOSURE', l.id, l.tcl_id, b.legal_name, null, c.respond_by, null
          from closure_requests c join credit_lines l on l.id = c.line_id join companies b on b.id = l.buyer_company_id
          where l.supplier_company_id = ${me} and c.status = 'OPEN'
        union all
        select 'DEFAULT', l.id, l.tcl_id, null, null, r.buyer_reply_by, null
          from default_reports r join credit_lines l on l.id = r.line_id
          where l.buyer_company_id = ${me} and r.status in ('UNDER_REVIEW', 'INFO_REQUESTED') and r.buyer_reply is null and r.buyer_reply_by > ${now}
        union all
        select 'SNAPSHOT', null, null, null, null, null, count(*)::int
          from credit_lines l where l.supplier_company_id = ${me} and l.status = 'ACTIVE'
            and not exists (select 1 from snapshots s where s.line_id = l.id and s.period = ${period})
        union all
        select 'CFO', null, null, u.name, null, d.effective_at, (case d.status when 'ACTIVE' then 1 else 0 end)
          from cfo_designations d join "user" u on u.id = d.user_id
          where d.company_id = ${me} and d.status in ('NOMINATED', 'APPROVED', 'ACTIVE')`,
  );
  const tasks: TaskView[] = [];
  const isCfo = v.cfo !== null;
  const manager = canManageLines(v.role) && v.company.status === "VERIFIED";
  for (const t of list) {
    const due = t.due_at ? new Date(t.due_at) : null;
    const base = { dueAt: isoOrNull(due), urgent: due ? urgent(due, now) : false };
    if (t.kind === "VERSION" && isCfo)
      tasks.push({ kind: t.version === 1 ? "CONFIRM_LINE" : "CONFIRM_AMENDMENT", params: { supplier: t.party!, tclId: t.tcl_id!, version: t.version! }, href: hrefs.confirm(t.line_id!), ...base });
    if (t.kind === "DISPUTE" && manager) tasks.push({ kind: "RESPOND_DISPUTE", params: { buyer: t.party!, tclId: t.tcl_id! }, href: hrefs.line(t.line_id!), ...base });
    if (t.kind === "CLOSURE" && manager) tasks.push({ kind: "RESPOND_CLOSURE", params: { buyer: t.party!, tclId: t.tcl_id! }, href: hrefs.line(t.line_id!), ...base });
    if (t.kind === "DEFAULT" && isCfo) tasks.push({ kind: "REPLY_DEFAULT", params: { tclId: t.tcl_id! }, href: hrefs.line(t.line_id!), ...base });
    if (t.kind === "SNAPSHOT" && manager && t.n) {
      const dueAt = snapshotDueAt(period);
      tasks.push({ kind: "SNAPSHOT_DUE", params: { count: t.n, period }, href: hrefs.snapshots, dueAt: iso(dueAt), urgent: urgent(dueAt, now) });
    }
  }
  const cfoRows = list.filter((t) => t.kind === "CFO");
  const pending = cfoRows.find((t) => t.n === 0);
  if (v.company.status === "UNVERIFIED") tasks.push({ kind: "AWAIT_VERIFICATION", params: {}, href: hrefs.company, dueAt: null, urgent: false });
  if (pending) tasks.push({ kind: "AWAIT_CFO_APPROVAL", params: { name: pending.party! }, href: hrefs.company, dueAt: isoOrNull(pending.due_at), urgent: false });
  else if (cfoRows.length === 0 && canManageTeam(v.role)) tasks.push({ kind: "NOMINATE_CFO", params: {}, href: hrefs.company, dueAt: null, urgent: true });
  return tasks.sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"));
}

const LIGHT_RANK = { RED: 0, YELLOW: 1, GREEN: 2 } as const;

export async function homeData(tx: Tx, v: Member, now: Date): Promise<HomeData> {
  const [lines, tasks, alerts, card] = await Promise.all([
    lineSummaries(tx, v.company.id),
    tasksFor(tx, v, now),
    notificationsFor(tx, v.company.id, { unreadOnly: true, limit: 5 }),
    scoreCard(tx, v.company.id),
  ]);
  const given = lines.filter((l) => l.side === "GIVEN");
  const watch = new Map<string, HomeData["watchlist"][number]>();
  for (const l of given) {
    const s = l.counterpartyScore;
    if (l.status !== "ACTIVE" || !s || s.light === "GREEN") continue;
    const prev = watch.get(l.counterparty.id);
    watch.set(l.counterparty.id, { ...l.counterparty, ...s, outstandingHalalas: (prev?.outstandingHalalas ?? 0) + (l.outstandingHalalas ?? 0) });
  }
  return {
    tasks,
    alerts,
    given: totals(given),
    received: totals(lines.filter((l) => l.side === "RECEIVED")),
    myScore: card && card.releasePeriod ? stripStatus(card) : null,
    watchlist: [...watch.values()].sort((a, b) => LIGHT_RANK[a.light] - LIGHT_RANK[b.light] || a.score - b.score).slice(0, 5),
  };
}

export function stripStatus<T extends { status: string }>(card: T): Omit<T, "status"> {
  const { status: _status, ...rest } = card;
  return rest;
}
