/**
 * The tick (DECISIONS S3): every deadline, CFO activation, the monthly release and message delivery.
 * Idempotent: each step only touches rows whose status and timer say it is due. One transaction guarded by an
 * advisory lock, so overlapping triggers (worker, cron, ops "run now") never run it twice at once.
 */
import { addDays, scheduledReleasePeriod, STALE_LINE_DAYS } from "@tmc/domain";
import { sql } from "drizzle-orm";
import type { Db } from "../index";
import { audit } from "./audit";
import { activateCfos, closeLines } from "./line-ops";
import { deliverQueued } from "./messaging";
import { hrefs, notify } from "./notify";
import { runRelease } from "./release";
import { rows } from "./sql";

const TICK_LOCK_KEY = 7_202_610;

export type TickResult = Record<string, number>;

export async function runTick(db: Db, now: Date): Promise<TickResult> {
  const result = await db.transaction(async (tx): Promise<TickResult> => {
    const [lock] = await rows<{ ok: boolean }>(tx, sql`select pg_try_advisory_xact_lock(${TICK_LOCK_KEY}) as ok`);
    if (!lock?.ok) return { skipped: 1 };

    const expired = await rows<{ id: string; line_id: string; version: number; tcl_id: string; supplier_company_id: string }>(
      tx,
      sql`with v as (
            update credit_line_versions set status = 'EXPIRED', decided_at = ${now}
            where status = 'PENDING' and expires_at <= ${now} returning id, line_id, version
          ), l as (
            update credit_lines cl set status = 'EXPIRED' from v
            where cl.id = v.line_id and v.version = 1 and cl.status = 'PENDING' returning cl.id
          )
          select v.id, v.line_id, v.version, cl.tcl_id, cl.supplier_company_id from v join credit_lines cl on cl.id = v.line_id`,
    );
    await notify(
      tx,
      expired.map((e) => ({ companyId: e.supplier_company_id, kind: "LINE_EXPIRED" as const, lineId: e.line_id, params: { tclId: e.tcl_id, version: e.version }, href: hrefs.line(e.line_id) })),
    );
    await audit(tx, expired.map((e) => ({ actor: null, companyId: e.supplier_company_id, entityType: "credit_line_version", entityId: e.id, action: "version.expired" })));

    const due = await rows<{ id: string }>(tx, sql`select id from cfo_designations where status = 'APPROVED' and effective_at <= ${now}`);
    const cfosActivated = await activateCfos(tx, due.map((d) => d.id), null, now);

    const escalated = await rows<{ id: string; line_id: string; tcl_id: string; supplier_company_id: string; buyer_company_id: string }>(
      tx,
      sql`with d as (update disputes set status = 'ESCALATED' where status = 'OPEN' and respond_by <= ${now} returning id, line_id)
          select d.id, d.line_id, l.tcl_id, l.supplier_company_id, l.buyer_company_id from d join credit_lines l on l.id = d.line_id`,
    );
    await notify(
      tx,
      escalated.flatMap((d) =>
        [d.supplier_company_id, d.buyer_company_id].map((companyId) => ({
          companyId,
          kind: "DISPUTE_DECIDED" as const,
          lineId: d.line_id,
          params: { tclId: d.tcl_id, outcome: "ESCALATED" },
          href: hrefs.line(d.line_id),
        })),
      ),
    );
    await audit(tx, escalated.map((d) => ({ actor: null, companyId: d.buyer_company_id, entityType: "dispute", entityId: d.id, action: "dispute.escalated" })));

    const unanswered = await rows<{ id: string; line_id: string }>(
      tx,
      sql`update closure_requests set status = 'AUTO_CLOSED', resolved_at = ${now} where status = 'OPEN' and respond_by <= ${now} returning id, line_id`,
    );
    const closedByRequest = await closeLines(
      tx,
      unanswered.map((c) => ({ lineId: c.line_id, reason: "Closure request not answered within 14 days" })),
      null,
      now,
      "line.auto_closed_request",
    );

    const stale = await rows<{ id: string }>(
      tx,
      sql`select l.id from credit_lines l left join snapshots s on s.line_id = l.id
          where l.status = 'ACTIVE' group by l.id
          having greatest(l.confirmed_at, max(s.submitted_at)) <= ${addDays(now, -STALE_LINE_DAYS)}`,
    );
    const closedStale = await closeLines(tx, stale.map((s) => ({ lineId: s.id, reason: "No snapshot for 90 days" })), null, now, "line.auto_closed_stale");

    const period = scheduledReleasePeriod(now);
    let released = 0;
    if (period) {
      const [exists] = await rows<{ n: number }>(tx, sql`select count(*)::int as n from score_releases where period >= ${period}`);
      if (!exists?.n) released = (await runRelease(tx, { period, now, runBy: null })).ok ? 1 : 0;
    }
    return {
      versionsExpired: expired.length,
      cfosActivated,
      disputesEscalated: escalated.length,
      linesClosed: closedByRequest.length + closedStale.length,
      released,
    };
  });
  if ("skipped" in result) return result;
  return { ...result, messagesSent: await deliverQueued(db, now) };
}
