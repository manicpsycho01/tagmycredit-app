import "server-only";
import { getDb, withTenant } from "@tmc/db";
import { rows } from "@tmc/db/jobs";
import { reportingPeriod, snapshotDueDate } from "@tmc/domain";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { now } from "./clock";
import type { Queries } from "./contracts";
import { companyPage } from "./services/company";
import { DEMO_PERSONAS } from "./services/demo";
import { homeData, notificationsFor, stripStatus } from "./services/home";
import { lineDetail } from "./services/line-detail";
import { lineSummaries } from "./services/lines";
import { auditList, opsQueue, outboxList, releaseList } from "./services/ops";
import { projectList, projectMap } from "./services/projects";
import { scoreCard } from "./services/scores";
import { getViewer, isDemoMode, pageMember, pageViewer, toSessionContext } from "./session";

export const getSession: Queries["getSession"] = cache(async () => {
  const v = await getViewer();
  return v ? toSessionContext(v) : null;
});

export const getHome: Queries["getHome"] = async () => {
  const v = await pageMember();
  return withTenant(v.company.id, (tx) => homeData(tx, v, now()));
};

export const listLines: Queries["listLines"] = async (side, filter) => {
  const v = await pageMember();
  const list = await withTenant(v.company.id, (tx) => lineSummaries(tx, v.company.id, { side, ...filter }));
  return list.map(({ supplier: _s, buyer: _b, createdAt: _c, confirmedAt: _cf, closedAt: _cl, closeReason: _cr, voidReason: _vr, ...summary }) => summary);
};

export const getLine: Queries["getLine"] = async (lineId) => {
  const v = await pageMember();
  if (!/^[0-9a-f-]{36}$/i.test(lineId)) return null;
  return withTenant(v.company.id, (tx) => lineDetail(tx, v, lineId, now()));
};

export const getSnapshotWorklist: Queries["getSnapshotWorklist"] = async () => {
  const v = await pageMember();
  const period = reportingPeriod(now());
  const { lines, submitted } = await withTenant(v.company.id, async (tx) => {
    const lines = await lineSummaries(tx, v.company.id, { side: "GIVEN", status: "ACTIVE" });
    const done = await rows<{ line_id: string }>(
      tx,
      sql`select s.line_id from snapshots s join credit_lines l on l.id = s.line_id where l.supplier_company_id = ${v.company.id} and s.period = ${period}`,
    );
    return { lines, submitted: new Set(done.map((d) => d.line_id)) };
  });
  return {
    period,
    dueDate: snapshotDueDate(period),
    lines: lines.map(({ supplier: _s, buyer: _b, createdAt: _c, confirmedAt: _cf, closedAt: _cl, closeReason: _cr, voidReason: _vr, ...l }) => ({ ...l, submitted: submitted.has(l.id) })),
  };
};

export const getScoreCard: Queries["getScoreCard"] = async (companyId) => {
  const v = await pageMember();
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return null;
  const own = companyId === v.company.id;
  if (!own && v.company.status !== "VERIFIED") return null;
  const card = await withTenant(v.company.id, (tx) => scoreCard(tx, companyId));
  if (!card || (!own && card.status !== "VERIFIED")) return null;
  return stripStatus(card);
};

export const listNotifications: Queries["listNotifications"] = async () => {
  const v = await pageMember();
  return withTenant(v.company.id, (tx) => notificationsFor(tx, v.company.id, { limit: 100 }));
};

export const getCompanyPage: Queries["getCompanyPage"] = async () => {
  const v = await pageMember();
  return withTenant(v.company.id, (tx) => companyPage(tx, v));
};

export const listProjects: Queries["listProjects"] = async () => {
  const v = await pageMember();
  return withTenant(v.company.id, (tx) => projectList(tx, v.company.id));
};

export const getProject: Queries["getProject"] = async (projectId) => {
  const v = await pageMember();
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  return withTenant(v.company.id, (tx) => projectMap(tx, projectId));
};

async function pageStaff() {
  const v = await pageViewer();
  if (!v.isStaff) notFound();
}

export const getOpsQueue: Queries["getOpsQueue"] = async () => {
  await pageStaff();
  return opsQueue();
};

export const listReleases: Queries["listReleases"] = async () => {
  await pageStaff();
  return releaseList();
};

export const listAudit: Queries["listAudit"] = async (filter) => {
  await pageStaff();
  return auditList(filter ?? {});
};

/** Dev outbox: any signed-in user in demo mode (CFO personas read their OTP here). */
export const listOutbox: Queries["listOutbox"] = async () => {
  await pageViewer();
  if (!isDemoMode()) notFound();
  return outboxList();
};

export const listDemoPersonas: Queries["listDemoPersonas"] = async () => {
  if (!isDemoMode()) return [];
  const found = await rows<{ email: string; name: string; company: string | null; is_cfo: boolean }>(
    getDb(),
    sql`select u.email, u.name, c.legal_name as company,
          exists (select 1 from cfo_designations d where d.user_id = u.id and d.status = 'ACTIVE') as is_cfo
        from "user" u left join memberships m on m.user_id = u.id left join companies c on c.id = m.company_id
        where u.email in (${sql.join(DEMO_PERSONAS.map((p) => sql`${p.email}`), sql`, `)})`,
  );
  const byEmail = new Map(found.map((f) => [f.email, f]));
  return DEMO_PERSONAS.flatMap((p) => {
    const f = byEmail.get(p.email);
    return f ? [{ email: p.email, name: f.name, storyKey: p.storyKey, companyName: f.company, role: p.role, isCfo: f.is_cfo }] : [];
  });
};
