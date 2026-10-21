import "server-only";
import { attachments, creditLines, creditLineVersions, getDb, snapshots } from "@tmc/db";
import { audit, closeLines, hrefs, notify, rows, type Executor } from "@tmc/db/jobs";
import {
  addDays,
  ALLOWED_UPLOAD_TYPES,
  CLOSURE_RESPONSE_DAYS,
  CONFIRM_WINDOW_DAYS,
  DEFAULT_REPLY_DAYS,
  defaultReportErrors,
  DISPUTE_RESPONSE_DAYS,
  disputeNeedsNewerSnapshot,
  effectiveDateError,
  formatSar,
  isLimitInRange,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  parseSar,
  riyadhIsoDate,
  type TermsDays,
} from "@tmc/domain";
import { and, eq, sql } from "drizzle-orm";
import { now } from "../clock";
import { fail, requireCfo, requireLineManager, requireStaff } from "../guard";
import { assertLineAction } from "./writes";

/* ───────── Evidence files ───────── */

/** Validates uploads (type, size, count). Throws `errors.validation` with fieldErrors.files on failure. */
export function evidenceFiles(files: File[], required: boolean): File[] {
  const list = files.filter((f) => f.size > 0);
  if (required && list.length === 0) fail("errors.validation", { files: "errors.evidenceRequired" });
  if (list.length > MAX_UPLOAD_FILES) fail("errors.validation", { files: "errors.tooManyFiles" });
  for (const f of list) {
    if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(f.type)) fail("errors.validation", { files: "errors.fileType" });
    if (f.size > MAX_UPLOAD_BYTES) fail("errors.validation", { files: "errors.fileTooLarge" });
  }
  return list;
}

async function saveFiles(tx: Executor, files: File[], o: { companyId: string; ownerType: "dispute" | "default"; ownerId: string; userId: string }) {
  if (files.length === 0) return;
  const values = await Promise.all(
    files.map(async (f) => ({
      companyId: o.companyId,
      ownerType: o.ownerType,
      ownerId: o.ownerId,
      fileName: f.name.slice(0, 200),
      mimeType: f.type,
      sizeBytes: f.size,
      content: Buffer.from(await f.arrayBuffer()),
      uploadedBy: o.userId,
    })),
  );
  await tx.insert(attachments).values(values);
}

/* ───────── Supplier ───────── */

export async function amendLine(input: { lineId: string; limitSar: number; termsDays: TermsDays; effectiveDate: string }) {
  const m = await requireLineManager();
  const t = now();
  const limit = parseSar(input.limitSar);
  if (limit === null || !isLimitInRange(limit)) fail("errors.validation", { limitSar: "errors.limitRange" });
  const dateErr = effectiveDateError(input.effectiveDate, riyadhIsoDate(t));
  if (dateErr) fail("errors.validation", { effectiveDate: dateErr });
  await getDb().transaction(async (tx) => {
    const f = await assertLineAction(tx, m, input.lineId, "AMEND");
    const [v] = await rows<{ version: number; buyer_name: string }>(
      tx,
      sql`select max(v.version)::int as version, (select legal_name from companies where id = ${f.buyerId}) as buyer_name
          from credit_line_versions v where v.line_id = ${input.lineId}`,
    );
    const version = (v?.version ?? 0) + 1;
    await tx.insert(creditLineVersions).values({
      lineId: input.lineId,
      version,
      limitHalalas: limit!,
      termsDays: input.termsDays,
      effectiveDate: input.effectiveDate,
      attestation: `${m.company.legalName} attests that it extends trade credit to ${v!.buyer_name} of up to ${formatSar(limit!)} on ${input.termsDays}-day terms, effective ${input.effectiveDate}, replacing the current terms once confirmed.`,
      proposedBy: m.userId,
      proposedAt: t,
      expiresAt: addDays(t, CONFIRM_WINDOW_DAYS),
    });
    await notify(tx, [{ companyId: f.buyerId, kind: "AMENDMENT_REQUESTED", lineId: input.lineId, params: { supplier: m.company.legalName, tclId: f.tclId, version }, href: hrefs.confirm(input.lineId) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "credit_line", entityId: input.lineId, action: "line.amended", data: { version, limit, termsDays: input.termsDays } });
  });
}

export async function respondDispute(input: { disputeId: string; response: string }) {
  const m = await requireLineManager();
  const t = now();
  await getDb().transaction(async (tx) => {
    const [d] = await rows<{ line_id: string }>(tx, sql`select line_id from disputes where id = ${input.disputeId} for update`);
    if (!d) return fail("errors.notFound");
    const f = await assertLineAction(tx, m, d.line_id, "RESPOND_DISPUTE");
    const done = await rows<{ id: string }>(
      tx,
      sql`update disputes set status = 'RESPONDED', supplier_response = ${input.response}, responded_by = ${m.userId}, responded_at = ${t}
          where id = ${input.disputeId} and status = 'OPEN' and respond_by > ${t} returning id`,
    );
    if (done.length === 0) fail("errors.disputeResponseClosed");
    await notify(tx, [{ companyId: f.buyerId, kind: "DISPUTE_OPENED", lineId: d.line_id, params: { tclId: f.tclId, responded: 1 }, href: hrefs.line(d.line_id) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "dispute", entityId: input.disputeId, action: "dispute.responded", data: {} });
  });
}

export async function respondClosure(input: { closureId: string; accept: boolean; objection?: string }) {
  const m = await requireLineManager();
  const t = now();
  if (!input.accept && !input.objection?.trim()) fail("errors.validation", { objection: "errors.required" });
  await getDb().transaction(async (tx) => {
    const [c] = await rows<{ line_id: string; reason: string }>(tx, sql`select line_id, reason from closure_requests where id = ${input.closureId} and status = 'OPEN' for update`);
    if (!c) return fail("errors.notFound");
    const f = await assertLineAction(tx, m, c.line_id, "RESPOND_CLOSURE");
    await tx.execute(sql`update closure_requests set status = ${input.accept ? "ACCEPTED" : "OBJECTED"}, objection = ${input.objection ?? null},
                         resolved_by = ${m.userId}, resolved_at = ${t} where id = ${input.closureId}`);
    if (input.accept) await closeLines(tx, [{ lineId: c.line_id, reason: `Closure requested by buyer: ${c.reason}` }], m.userId, t, "line.closed");
    else await notify(tx, [{ companyId: f.buyerId, kind: "CLOSURE_REQUESTED", lineId: c.line_id, params: { tclId: f.tclId, objected: 1 }, href: hrefs.line(c.line_id) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "closure_request", entityId: input.closureId, action: input.accept ? "closure.accepted" : "closure.objected", data: {} });
  });
}

export async function fileDefault(input: { lineId: string; amountSar: number; oldestDueDate: string; note: string; files: File[] }) {
  const m = await requireLineManager();
  const t = now();
  const amount = parseSar(input.amountSar);
  if (amount === null || amount <= 0) fail("errors.validation", { amountSar: "errors.amountInvalid" });
  const files = evidenceFiles(input.files, true);
  await getDb().transaction(async (tx) => {
    const f = await assertLineAction(tx, m, input.lineId, "FILE_DEFAULT");
    const errors = defaultReportErrors({ amount: amount!, oldestDueDate: input.oldestDueDate, latestD90Plus: f.latestD90Plus, today: riyadhIsoDate(t), files: files.length });
    if (Object.keys(errors).length) fail("errors.validation", errors);
    const [r] = await rows<{ id: string }>(
      tx,
      sql`insert into default_reports (line_id, reported_by, amount_halalas, oldest_due_date, note, buyer_reply_by, created_at)
          values (${input.lineId}, ${m.userId}, ${amount}, ${input.oldestDueDate}, ${input.note}, ${addDays(t, DEFAULT_REPLY_DAYS)}, ${t}) returning id`,
    );
    await saveFiles(tx, files, { companyId: m.company.id, ownerType: "default", ownerId: r!.id, userId: m.userId });
    await notify(tx, [{ companyId: f.buyerId, kind: "DEFAULT_FILED", lineId: input.lineId, params: { tclId: f.tclId, replyDays: DEFAULT_REPLY_DAYS }, href: hrefs.line(input.lineId) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "default_report", entityId: r!.id, action: "default.filed", data: { amount, files: files.length } });
  });
}

/** Supplier retracts (before decision) or claims settlement (after uphold). */
async function supplierDefaultUpdate(defaultId: string, action: "RETRACT_DEFAULT" | "MARK_DEFAULT_SETTLED") {
  const m = await requireLineManager();
  const t = now();
  await getDb().transaction(async (tx) => {
    const [r] = await rows<{ line_id: string }>(tx, sql`select line_id from default_reports where id = ${defaultId} for update`);
    if (!r) return fail("errors.notFound");
    await assertLineAction(tx, m, r.line_id, action);
    if (action === "RETRACT_DEFAULT") {
      await tx.execute(sql`update default_reports set status = 'RETRACTED', decided_at = ${t} where id = ${defaultId} and status in ('UNDER_REVIEW', 'INFO_REQUESTED')`);
    } else {
      await tx.execute(sql`update default_reports set settled_at = ${t} where id = ${defaultId} and status = 'UPHELD' and settled_at is null`);
    }
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "default_report", entityId: defaultId, action: action === "RETRACT_DEFAULT" ? "default.retracted" : "default.settlement_claimed", data: {} });
  });
}
export const retractDefault = (input: { defaultId: string }) => supplierDefaultUpdate(input.defaultId, "RETRACT_DEFAULT");
export const markDefaultSettled = (input: { defaultId: string }) => supplierDefaultUpdate(input.defaultId, "MARK_DEFAULT_SETTLED");

/* ───────── Buyer CFO ───────── */

export async function openDispute(input: { lineId: string; reason: string; files: File[] }) {
  const m = await requireCfo();
  const t = now();
  const files = evidenceFiles(input.files, true);
  await getDb().transaction(async (tx) => {
    const f = await assertLineAction(tx, m, input.lineId, "DISPUTE");
    if (disputeNeedsNewerSnapshot(f, t)) {
      const [newer] = await rows<{ ok: boolean }>(
        tx,
        sql`select exists (select 1 from snapshots where line_id = ${input.lineId} and submitted_at > ${f.lastRejectedDisputeAt}) as ok`,
      );
      if (!newer?.ok) fail("errors.disputeNeedsNewerSnapshot");
    }
    const [d] = await rows<{ id: string }>(
      tx,
      sql`insert into disputes (line_id, raised_by, reason, respond_by, created_at)
          values (${input.lineId}, ${m.userId}, ${input.reason}, ${addDays(t, DISPUTE_RESPONSE_DAYS)}, ${t}) returning id`,
    );
    await saveFiles(tx, files, { companyId: m.company.id, ownerType: "dispute", ownerId: d!.id, userId: m.userId });
    await notify(tx, [{ companyId: f.supplierId, kind: "DISPUTE_OPENED", lineId: input.lineId, params: { tclId: f.tclId, buyer: m.company.legalName, respondDays: DISPUTE_RESPONSE_DAYS }, href: hrefs.line(input.lineId) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "dispute", entityId: d!.id, action: "dispute.opened", data: { files: files.length } });
  });
}

export async function requestClosure(input: { lineId: string; reason: string }) {
  const m = await requireCfo();
  const t = now();
  await getDb().transaction(async (tx) => {
    const f = await assertLineAction(tx, m, input.lineId, "REQUEST_CLOSURE");
    const [c] = await rows<{ id: string }>(
      tx,
      sql`insert into closure_requests (line_id, requested_by, reason, respond_by, created_at)
          values (${input.lineId}, ${m.userId}, ${input.reason}, ${addDays(t, CLOSURE_RESPONSE_DAYS)}, ${t}) returning id`,
    );
    await notify(tx, [{ companyId: f.supplierId, kind: "CLOSURE_REQUESTED", lineId: input.lineId, params: { tclId: f.tclId, buyer: m.company.legalName, respondDays: CLOSURE_RESPONSE_DAYS }, href: hrefs.line(input.lineId) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "closure_request", entityId: c!.id, action: "closure.requested", data: {} });
  });
}

export async function replyDefault(input: { defaultId: string; reply: string }) {
  const m = await requireCfo();
  const t = now();
  await getDb().transaction(async (tx) => {
    const [r] = await rows<{ line_id: string }>(tx, sql`select line_id from default_reports where id = ${input.defaultId} for update`);
    if (!r) return fail("errors.notFound");
    const f = await assertLineAction(tx, m, r.line_id, "REPLY_DEFAULT");
    await tx.execute(sql`update default_reports set buyer_reply = ${input.reply}, buyer_replied_at = ${t} where id = ${input.defaultId}`);
    await notify(tx, [{ companyId: f.supplierId, kind: "DEFAULT_FILED", lineId: r.line_id, params: { tclId: f.tclId, replied: 1 }, href: hrefs.line(r.line_id) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "default_report", entityId: input.defaultId, action: "default.buyer_replied", data: {} });
  });
}

/* ───────── Ops ───────── */

/** Confirms a supplier's settlement claim: correction alert to everyone who got the network alert (SPEC §6). */
export async function confirmDefaultSettled(input: { defaultId: string }) {
  const s = await requireStaff();
  await getDb().transaction(async (tx) => {
    const [r] = await rows<{ line_id: string; buyer_company_id: string; buyer_name: string; buyer_tmc: string; supplier_company_id: string; tcl_id: string }>(
      tx,
      sql`with r as (update default_reports set status = 'SETTLED' where id = ${input.defaultId} and status = 'UPHELD' and settled_at is not null returning line_id)
          select r.line_id, l.buyer_company_id, b.legal_name as buyer_name, b.tmc_id as buyer_tmc, l.supplier_company_id, l.tcl_id
          from r join credit_lines l on l.id = r.line_id join companies b on b.id = l.buyer_company_id`,
    );
    if (!r) return fail("errors.notFound");
    const recipients = await rows<{ company_id: string }>(
      tx,
      sql`select distinct company_id from notifications where kind = 'NETWORK_ALERT' and payload->'params'->>'defaultId' = ${input.defaultId}`,
    );
    await notify(tx, [
      ...recipients.map((x) => ({ companyId: x.company_id, kind: "NETWORK_ALERT_RESOLVED" as const, params: { buyer: r.buyer_name, buyerTmcId: r.buyer_tmc }, href: hrefs.check(r.buyer_company_id) })),
      ...[r.supplier_company_id, r.buyer_company_id].map((companyId) => ({ companyId, kind: "DEFAULT_DECIDED" as const, lineId: r.line_id, params: { tclId: r.tcl_id, outcome: "SETTLED" }, href: hrefs.line(r.line_id) })),
    ]);
    await audit(tx, { actor: s.userId, companyId: r.buyer_company_id, entityType: "default_report", entityId: input.defaultId, action: "default.settled", data: { corrections: recipients.length } });
  });
}

export async function voidLine(input: { lineId: string; reason: string }) {
  const s = await requireStaff();
  const t = now();
  await getDb().transaction(async (tx) => {
    const [l] = await tx
      .update(creditLines)
      .set({ status: "VOIDED", voidedAt: t, voidReason: input.reason, suspended: false })
      .where(and(eq(creditLines.id, input.lineId), sql`${creditLines.status} <> 'VOIDED'`))
      .returning({ tclId: creditLines.tclId, supplierId: creditLines.supplierCompanyId, buyerId: creditLines.buyerCompanyId });
    if (!l) return fail("errors.notFound");
    await tx.execute(sql`update credit_line_versions set status = 'EXPIRED', decided_at = ${t} where line_id = ${input.lineId} and status = 'PENDING'`);
    await notify(tx, [l.supplierId, l.buyerId].map((companyId) => ({ companyId, kind: "LINE_VOIDED" as const, lineId: input.lineId, params: { tclId: l.tclId }, href: hrefs.line(input.lineId) })));
    await audit(tx, { actor: s.userId, companyId: l.buyerId, entityType: "credit_line", entityId: input.lineId, action: "line.voided", data: { reason: input.reason } });
  });
}

export async function setLineSuspended(input: { lineId: string; suspended: boolean; note: string }) {
  const s = await requireStaff();
  await getDb().transaction(async (tx) => {
    const [l] = await tx
      .update(creditLines)
      .set({ suspended: input.suspended })
      .where(and(eq(creditLines.id, input.lineId), eq(creditLines.status, "ACTIVE")))
      .returning({ buyerId: creditLines.buyerCompanyId });
    if (!l) return fail("errors.notFound");
    await audit(tx, { actor: s.userId, companyId: l.buyerId, entityType: "credit_line", entityId: input.lineId, action: input.suspended ? "line.suspended" : "line.unsuspended", data: { note: input.note } });
  });
}

export async function decideSnapshot(input: { snapshotId: string; release: boolean; note: string }) {
  const s = await requireStaff();
  const t = now();
  await getDb().transaction(async (tx) => {
    const [x] = await tx
      .update(snapshots)
      .set({ quarantined: false, rejected: !input.release, reviewedBy: s.userId, reviewedAt: t })
      .where(and(eq(snapshots.id, input.snapshotId), eq(snapshots.quarantined, true)))
      .returning({ lineId: snapshots.lineId });
    if (!x) return fail("errors.notFound");
    await audit(tx, { actor: s.userId, companyId: null, entityType: "snapshot", entityId: input.snapshotId, action: input.release ? "snapshot.released" : "snapshot.rejected", data: { note: input.note, lineId: x.lineId } });
  });
}
