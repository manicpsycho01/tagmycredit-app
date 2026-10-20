/** Line state changes shared by server actions and the tick. */
import { addDays, CONFIRM_WINDOW_DAYS } from "@tmc/domain";
import { sql } from "drizzle-orm";
import { audit, type Executor } from "./audit";
import { queueMessages } from "./messaging";
import { hrefs, notify } from "./notify";
import { rows } from "./sql";

interface ClosedLine {
  id: string;
  tcl_id: string;
  supplier_company_id: string;
  buyer_company_id: string;
}

/** Close ACTIVE lines (supplier close, accepted/unanswered closure request, 90 days without a snapshot). */
export async function closeLines(
  tx: Executor,
  items: { lineId: string; reason: string }[],
  actor: string | null,
  now: Date,
  action: string,
): Promise<ClosedLine[]> {
  if (items.length === 0) return [];
  const values = sql.join(items.map((i) => sql`(${i.lineId}::uuid, ${i.reason})`), sql`, `);
  const closed = await rows<ClosedLine>(
    tx,
    sql`update credit_lines l set status = 'CLOSED', closed_at = ${now}, close_reason = v.reason
        from (values ${values}) as v(id, reason)
        where l.id = v.id and l.status = 'ACTIVE'
        returning l.id, l.tcl_id, l.supplier_company_id, l.buyer_company_id`,
  );
  if (closed.length === 0) return closed;
  const ids = sql.join(closed.map((c) => sql`${c.id}::uuid`), sql`, `);
  await tx.execute(sql`update credit_line_versions set status = 'SUPERSEDED', decided_at = ${now} where line_id in (${ids}) and status = 'PENDING'`);
  await tx.execute(
    sql`update closure_requests set status = 'ACCEPTED', resolved_by = ${actor}, resolved_at = ${now} where line_id in (${ids}) and status = 'OPEN'`,
  );
  await notify(
    tx,
    closed.flatMap((c) => [
      { companyId: c.buyer_company_id, kind: "LINE_CLOSED" as const, lineId: c.id, params: { tclId: c.tcl_id }, href: hrefs.line(c.id) },
      ...(actor === null
        ? [{ companyId: c.supplier_company_id, kind: "LINE_CLOSED" as const, lineId: c.id, params: { tclId: c.tcl_id }, href: hrefs.line(c.id) }]
        : []),
    ]),
  );
  const reasons = new Map(items.map((i) => [i.lineId, i.reason]));
  await audit(
    tx,
    closed.map((c) => ({ actor, companyId: c.supplier_company_id, entityType: "credit_line", entityId: c.id, action, data: { reason: reasons.get(c.id) } })),
  );
  return closed;
}

interface Activated {
  id: string;
  company_id: string;
  user_id: string;
  email: string;
  name: string;
}

/**
 * Make CFO designations ACTIVE (end of cooling-off, or an ops waiver). The previous ACTIVE CFO is ended first
 * (one ACTIVE per company), pending confirmations are re-issued to the new CFO with a fresh 14-day window.
 */
export async function activateCfos(tx: Executor, designationIds: string[], actor: string | null, now: Date): Promise<number> {
  if (designationIds.length === 0) return 0;
  const ids = sql.join(designationIds.map((id) => sql`${id}::uuid`), sql`, `);
  const targets = await rows<Activated>(
    tx,
    sql`select d.id, d.company_id, d.user_id, u.email, u.name from cfo_designations d join "user" u on u.id = d.user_id
        where d.id in (${ids}) and d.status = 'APPROVED' for update of d`,
  );
  if (targets.length === 0) return 0;
  const companies = sql.join(targets.map((t) => sql`${t.company_id}::uuid`), sql`, `);
  const ended = await rows<{ id: string; company_id: string; email: string }>(
    tx,
    sql`update cfo_designations d set status = 'ENDED', ended_at = ${now} from "user" u
        where u.id = d.user_id and d.company_id in (${companies}) and d.status = 'ACTIVE'
        returning d.id, d.company_id, u.email`,
  );
  const targetIds = sql.join(targets.map((t) => sql`${t.id}::uuid`), sql`, `);
  await tx.execute(sql`update cfo_designations set status = 'ACTIVE', effective_at = ${now} where id in (${targetIds})`);
  const reissued = await rows<{ version_id: string; line_id: string; tcl_id: string; buyer_company_id: string; version: number }>(
    tx,
    sql`update credit_line_versions v set expires_at = ${addDays(now, CONFIRM_WINDOW_DAYS)}, failed_codes = 0, locked_until = null
        from credit_lines l
        where l.id = v.line_id and l.buyer_company_id in (${companies}) and v.status = 'PENDING'
        returning v.id as version_id, l.id as line_id, l.tcl_id, l.buyer_company_id, v.version`,
  );
  if (reissued.length) {
    const vids = sql.join(reissued.map((r) => sql`${r.version_id}::uuid`), sql`, `);
    await tx.execute(sql`update otp_challenges set consumed_at = ${now} where version_id in (${vids}) and consumed_at is null`);
  }
  await notify(tx, [
    ...targets.map((t) => ({ companyId: t.company_id, kind: "CFO_ACTIVE" as const, params: { name: t.name }, href: hrefs.company })),
    ...reissued.map((r) => ({
      companyId: r.buyer_company_id,
      kind: r.version === 1 ? ("LINE_CONFIRMATION_REQUESTED" as const) : ("AMENDMENT_REQUESTED" as const),
      lineId: r.line_id,
      params: { tclId: r.tcl_id, version: r.version },
      href: hrefs.confirm(r.line_id),
    })),
  ]);
  await queueMessages(
    tx,
    [
      ...targets.map((t) => ({
        channel: "EMAIL" as const,
        recipient: t.email,
        subject: "You are now the CFO on TagMyCredit",
        body: `Your CFO authority is now active. ${reissued.filter((r) => r.buyer_company_id === t.company_id).length} credit line confirmation(s) are waiting for you.`,
      })),
      ...ended.map((e) => ({
        channel: "EMAIL" as const,
        recipient: e.email,
        subject: "Your CFO authority on TagMyCredit has ended",
        body: "A new CFO is now active for your company. You can no longer confirm credit lines.",
      })),
    ],
    now,
  );
  await audit(tx, [
    ...ended.map((e) => ({ actor, companyId: e.company_id, entityType: "cfo", entityId: e.id, action: "cfo.ended" })),
    ...targets.map((t) => ({ actor, companyId: t.company_id, entityType: "cfo", entityId: t.id, action: "cfo.activated", data: { reissued: reissued.length } })),
  ]);
  return targets.length;
}
