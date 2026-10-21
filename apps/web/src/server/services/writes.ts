import "server-only";
import { companies, creditLines, creditLineVersions, getDb, memberships, notifications, otpChallenges, snapshots, withTenant } from "@tmc/db";
import {
  activateCfos,
  audit,
  buyerMeetsFloorNow,
  closeLines,
  hrefs,
  num,
  queueMessages,
  rows,
  runRelease,
  runTick,
  notify,
} from "@tmc/db/jobs";
import {
  addDays,
  addHours,
  buildTmcId,
  CFO_COOLING_OFF_HOURS,
  CONFIRM_WINDOW_DAYS,
  effectiveDateError,
  formatSar,
  formatTclId,
  generateOtpCode,
  hashOtp,
  isLimitInRange,
  latestCompletedPeriod,
  lineActions,
  maskMobile,
  newLineBlockReason,
  otpExpiresAt,
  otpFailureOutcome,
  otpSendBlockReason,
  otpSendWindowStart,
  parseSar,
  periodOf,
  periodOfDate,
  quarantineReason,
  riyadhIsoDate,
  tmcRandomDigits,
  validateSnapshot,
  verifyOtp,
  type CompanyStatus,
  type LineAction,
  type SnapshotInput,
  type TermsDays,
} from "@tmc/domain";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { now } from "../clock";
import type { LookupResult, ReleaseView } from "../contracts";
import { fail, type Member, requireCfo, requireLineManager, requireMember, requireStaff, requireViewer } from "../guard";
import { loadLineFacts, type LoadedFacts } from "./lines";

const otpSecret = () => process.env.OTP_SECRET ?? fail("errors.serverMisconfigured");

/** Facts for a line the member's company is party to, with the action check applied (same rule as the UI). */
export async function assertLineAction(ex: Parameters<typeof loadLineFacts>[0], m: Member, lineId: string, action: LineAction): Promise<LoadedFacts> {
  const facts = await loadLineFacts(ex, lineId, true);
  if (!facts || (facts.supplierId !== m.company.id && facts.buyerId !== m.company.id)) return fail("errors.notFound");
  const side = facts.supplierId === m.company.id ? "SUPPLIER" : "BUYER";
  const { actions, disputeBlockedReason } = lineActions(facts, { side, role: m.role, isCfo: m.cfo !== null, companyStatus: m.company.status }, now());
  if (!actions.includes(action)) fail(action === "DISPUTE" && disputeBlockedReason ? disputeBlockedReason : "errors.actionNotAllowed");
  return facts;
}

/* ───────── Onboarding ───────── */

export async function registerCompany(input: { legalName: string; legalNameAr?: string; crNumber: string; city: string; sector: string; title?: string }) {
  const v = await requireViewer();
  if (v.company) fail("errors.alreadyMember");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [taken] = await rows<{ n: number }>(tx, sql`select count(*)::int as n from companies where cr_number = ${input.crNumber}`);
    if (taken!.n > 0) fail("errors.crTaken", { crNumber: "errors.crTaken" });
    const random = tmcRandomDigits(randomInt(10_000));
    const [seq] = await rows<{ n: number }>(
      tx,
      sql`select count(*)::int as n from companies where tmc_id like ${`TMC-SA-${random}-${input.crNumber.slice(-4)}-%`}`,
    );
    const tmcId = buildTmcId(random, input.crNumber, seq!.n + 1);
    const [company] = await tx
      .insert(companies)
      .values({ tmcId, legalName: input.legalName, legalNameAr: input.legalNameAr || null, crNumber: input.crNumber, city: input.city, sector: input.sector })
      .returning({ id: companies.id });
    await tx.insert(memberships).values({ companyId: company!.id, userId: v.userId, role: "OWNER", title: input.title || null });
    await audit(tx, { actor: v.userId, companyId: company!.id, entityType: "company", entityId: company!.id, action: "company.registered", data: { tmcId } });
    return { tmcId };
  });
}

/* ───────── Lookup & lines ───────── */

export async function lookupCompany(q: string): Promise<LookupResult | null> {
  const m = await requireMember();
  return withTenant(m.company.id, async (tx) => {
    const [c] = await rows<{ id: string; tmc_id: string; legal_name: string; legal_name_ar: string | null; city: string; sector: string; status: CompanyStatus; has_cfo: boolean; open_line: boolean }>(
      tx,
      sql`select c.*, company_has_active_cfo(c.id) as has_cfo,
            exists (select 1 from credit_lines l where l.supplier_company_id = ${m.company.id} and l.buyer_company_id = c.id and l.status in ('PENDING', 'ACTIVE')) as open_line
          from lookup_company(${q}) c`,
    );
    if (!c) return null;
    const reason = newLineBlockReason({
      viewerRole: m.role,
      viewerCompanyStatus: m.company.status,
      sameCompany: c.id === m.company.id,
      buyerStatus: c.status,
      buyerHasActiveCfo: c.has_cfo,
      hasOpenLine: c.open_line,
    });
    return {
      company: { id: c.id, tmcId: c.tmc_id, legalName: c.legal_name, legalNameAr: c.legal_name_ar, city: c.city, sector: c.sector, status: c.status },
      canTag: reason === null,
      cannotTagReason: reason,
    };
  });
}

export async function createLine(input: { buyerCompanyId: string; limitSar: number; termsDays: TermsDays; effectiveDate: string }) {
  const m = await requireLineManager();
  const t = now();
  const limit = parseSar(input.limitSar);
  if (limit === null || !isLimitInRange(limit)) fail("errors.validation", { limitSar: "errors.limitRange" });
  const dateErr = effectiveDateError(input.effectiveDate, riyadhIsoDate(t));
  if (dateErr) fail("errors.validation", { effectiveDate: dateErr });
  return getDb().transaction(async (tx) => {
    const [buyer] = await rows<{ id: string; legal_name: string; status: CompanyStatus; cfo_email: string | null; open_line: boolean }>(
      tx,
      sql`select c.id, c.legal_name, c.status,
            (select u.email from cfo_designations d join "user" u on u.id = d.user_id where d.company_id = c.id and d.status = 'ACTIVE') as cfo_email,
            exists (select 1 from credit_lines l where l.supplier_company_id = ${m.company.id} and l.buyer_company_id = c.id and l.status in ('PENDING', 'ACTIVE')) as open_line
          from companies c where c.id = ${input.buyerCompanyId} for update`,
    );
    if (!buyer) return fail("errors.notFound");
    const reason = newLineBlockReason({
      viewerRole: m.role,
      viewerCompanyStatus: m.company.status,
      sameCompany: buyer.id === m.company.id,
      buyerStatus: buyer.status,
      buyerHasActiveCfo: buyer.cfo_email !== null,
      hasOpenLine: buyer.open_line,
    });
    if (reason) fail(reason);
    const [seq] = await rows<{ n: string }>(tx, sql`select nextval('tcl_seq') as n`);
    const tclId = formatTclId(num(seq!.n));
    const [line] = await tx
      .insert(creditLines)
      .values({ tclId, supplierCompanyId: m.company.id, buyerCompanyId: buyer.id, createdBy: m.userId, createdAt: t })
      .returning({ id: creditLines.id });
    const attestation = `${m.company.legalName} attests that it extends trade credit to ${buyer.legal_name} of up to ${formatSar(limit!)} on ${input.termsDays}-day terms, effective ${input.effectiveDate}, and that the monthly figures it reports for this line will be accurate.`;
    await tx.insert(creditLineVersions).values({
      lineId: line!.id,
      version: 1,
      limitHalalas: limit!,
      termsDays: input.termsDays,
      effectiveDate: input.effectiveDate,
      attestation,
      proposedBy: m.userId,
      proposedAt: t,
      expiresAt: addDays(t, CONFIRM_WINDOW_DAYS),
    });
    await notify(tx, [{ companyId: buyer.id, kind: "LINE_CONFIRMATION_REQUESTED", lineId: line!.id, params: { supplier: m.company.legalName, tclId, version: 1 }, href: hrefs.confirm(line!.id) }]);
    await queueMessages(
      tx,
      [{ channel: "EMAIL", recipient: buyer.cfo_email!, subject: `Confirm credit line ${tclId}`, body: `${m.company.legalName} has tagged a credit line to ${buyer.legal_name} (${tclId}). Sign in to TagMyCredit to review and confirm it within ${CONFIRM_WINDOW_DAYS} days.` }],
      t,
    );
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "credit_line", entityId: line!.id, action: "line.created", data: { tclId, limit, termsDays: input.termsDays } });
    return { lineId: line!.id, tclId };
  });
}

export async function closeLine(input: { lineId: string; reason: string }) {
  const m = await requireLineManager();
  return getDb().transaction(async (tx) => {
    const facts = await assertLineAction(tx, m, input.lineId, "CLOSE");
    if (facts.supplierId !== m.company.id) fail("errors.forbidden");
    await closeLines(tx, [{ lineId: input.lineId, reason: input.reason }], m.userId, now(), "line.closed");
  });
}

/* ───────── CFO confirmation ───────── */

interface VersionRow {
  id: string;
  line_id: string;
  version: number;
  status: string;
  expires_at: Date;
  locked_until: Date | null;
  failed_codes: number;
  buyer_company_id: string;
  supplier_company_id: string;
  tcl_id: string;
  current_version: number | null;
  line_status: string;
}

async function lockVersion(tx: Parameters<typeof rows>[0], versionId: string, buyerId: string): Promise<VersionRow> {
  const [v] = await rows<VersionRow>(
    tx,
    sql`select v.id, v.line_id, v.version, v.status, v.expires_at, v.locked_until, v.failed_codes, l.buyer_company_id, l.supplier_company_id,
          l.tcl_id, l.current_version, l.status as line_status
        from credit_line_versions v join credit_lines l on l.id = v.line_id where v.id = ${versionId} for update of v, l`,
  );
  if (!v || v.buyer_company_id !== buyerId) return fail("errors.notFound");
  if (v.status !== "PENDING") fail("errors.versionNotPending");
  if (new Date(v.expires_at) <= now()) fail("errors.versionExpired");
  return v;
}

export async function requestOtp(input: { versionId: string }) {
  const m = await requireCfo();
  const t = now();
  return getDb().transaction(async (tx) => {
    const v = await lockVersion(tx, input.versionId, m.company.id);
    const [sent] = await rows<{ n: number }>(
      tx,
      sql`select count(*)::int as n from otp_challenges where version_id = ${v.id} and created_at > ${otpSendWindowStart(t)}`,
    );
    const block = otpSendBlockReason({ now: t, signedInAt: m.signedInAt, sendsInLastHour: sent!.n, lockedUntil: v.locked_until ? new Date(v.locked_until) : null });
    if (block) fail(block);
    const code = generateOtpCode();
    const binding = { versionId: v.id, cfoUserId: m.userId, phone: m.cfo.mobile };
    const expiresAt = otpExpiresAt(t);
    await tx.update(otpChallenges).set({ consumedAt: t }).where(and(eq(otpChallenges.versionId, v.id), isNull(otpChallenges.consumedAt)));
    await tx.insert(otpChallenges).values({ ...binding, codeHash: await hashOtp(otpSecret(), binding, code), expiresAt, createdAt: t });
    await queueMessages(
      tx,
      [{ channel: "SMS", recipient: m.cfo.mobile, body: `TagMyCredit: ${code} is your code to confirm ${v.tcl_id} v${v.version}. Valid 10 minutes. Never share it. رمز التأكيد: ${code}` }],
      t,
    );
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "credit_line_version", entityId: v.id, action: "otp.sent" });
    return { sentTo: maskMobile(m.cfo.mobile), expiresAt: expiresAt.toISOString() };
  });
}

export async function confirmVersion(input: { versionId: string; code: string }) {
  const m = await requireCfo();
  const t = now();
  const db = getDb();
  // Wrong codes must persist their attempt count, so the transaction returns an error key instead of throwing.
  const error = await db.transaction(async (tx): Promise<string | null> => {
    const v = await lockVersion(tx, input.versionId, m.company.id);
    if (v.locked_until && new Date(v.locked_until) > t) return "errors.otpLocked";
    const [challenge] = await rows<{ id: string; code_hash: string; attempts: number }>(
      tx,
      sql`update otp_challenges set attempts = attempts + 1
          where id = (select id from otp_challenges where version_id = ${v.id} and cfo_user_id = ${m.userId} and phone = ${m.cfo.mobile}
                        and consumed_at is null and expires_at > ${t} order by created_at desc limit 1)
            and attempts < 5
          returning id, code_hash, attempts`,
    );
    if (!challenge) return "errors.otpExpired";
    const binding = { versionId: v.id, cfoUserId: m.userId, phone: m.cfo.mobile };
    if (!(await verifyOtp(otpSecret(), binding, input.code.trim(), challenge.code_hash))) {
      const outcome = otpFailureOutcome(challenge.attempts, v.failed_codes, t);
      if (outcome.exhausted) await tx.update(otpChallenges).set({ consumedAt: t }).where(eq(otpChallenges.id, challenge.id));
      await tx.update(creditLineVersions).set({ failedCodes: outcome.failedCodes, lockedUntil: outcome.lockedUntil }).where(eq(creditLineVersions.id, v.id));
      await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "credit_line_version", entityId: v.id, action: "otp.failed", data: { attemptsLeft: outcome.attemptsLeft } });
      return outcome.lockedUntil ? "errors.otpLocked" : "errors.otpWrong";
    }
    await tx.update(otpChallenges).set({ consumedAt: t }).where(eq(otpChallenges.id, challenge.id));
    await tx.update(creditLineVersions).set({ status: "SUPERSEDED" }).where(and(eq(creditLineVersions.lineId, v.line_id), eq(creditLineVersions.status, "CONFIRMED")));
    await tx.update(creditLineVersions).set({ status: "CONFIRMED", decidedBy: m.userId, decidedAt: t, failedCodes: 0, lockedUntil: null }).where(eq(creditLineVersions.id, v.id));
    await tx
      .update(creditLines)
      .set({ status: "ACTIVE", currentVersion: v.version, ...(v.line_status === "PENDING" ? { confirmedAt: t } : {}) })
      .where(eq(creditLines.id, v.line_id));
    await notify(tx, [{ companyId: v.supplier_company_id, kind: "LINE_CONFIRMED", lineId: v.line_id, params: { buyer: m.company.legalName, tclId: v.tcl_id, version: v.version }, href: hrefs.line(v.line_id) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "credit_line_version", entityId: v.id, action: "version.confirmed", data: { version: v.version } });
    return null;
  });
  if (error) fail(error);
}

export async function declineVersion(input: { versionId: string; reason?: string }) {
  const m = await requireCfo();
  const t = now();
  await getDb().transaction(async (tx) => {
    const v = await lockVersion(tx, input.versionId, m.company.id);
    await tx.update(creditLineVersions).set({ status: "DECLINED", decidedBy: m.userId, decidedAt: t, declineReason: input.reason || null }).where(eq(creditLineVersions.id, v.id));
    if (v.version === 1) await tx.update(creditLines).set({ status: "DECLINED" }).where(eq(creditLines.id, v.line_id));
    await notify(tx, [{ companyId: v.supplier_company_id, kind: "LINE_DECLINED", lineId: v.line_id, params: { buyer: m.company.legalName, tclId: v.tcl_id, version: v.version }, href: hrefs.line(v.line_id) }]);
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "credit_line_version", entityId: v.id, action: "version.declined", data: { reason: input.reason ?? null } });
  });
}

/* ───────── Snapshots ───────── */

export async function submitSnapshot(input: { lineId: string; supplierNote?: string } & SnapshotInput) {
  const m = await requireLineManager();
  const t = now();
  const { lineId, supplierNote, ...snap } = input;
  return getDb().transaction(async (tx) => {
    await assertLineAction(tx, m, lineId, "SUBMIT_SNAPSHOT");
    const [ctx] = await rows<{ limit_halalas: string; first_date: string; released: boolean; prev: Record<string, string> | null }>(
      tx,
      sql`select v.limit_halalas,
            (select min(effective_date)::text from credit_line_versions where line_id = l.id and status in ('CONFIRMED', 'SUPERSEDED')) as first_date,
            exists (select 1 from score_releases r where r.period >= ${snap.period}) as released,
            (select row_to_json(p) from (select outstanding, d31_60, d61_90, d90_plus from snapshots
               where line_id = l.id and period < ${snap.period} and not rejected order by period desc limit 1) p) as prev
          from credit_lines l join credit_line_versions v on v.line_id = l.id and v.version = l.current_version where l.id = ${lineId}`,
    );
    if (!ctx) return fail("errors.notFound");
    const errors = validateSnapshot(snap, { currentPeriod: periodOf(t), firstPeriod: periodOfDate(ctx.first_date) });
    if (Object.keys(errors).length) fail("errors.validation", errors);
    const prev = ctx.prev
      ? { ...snap, outstanding: num(ctx.prev.outstanding), d31_60: num(ctx.prev.d31_60), d61_90: num(ctx.prev.d61_90), d90Plus: num(ctx.prev.d90_plus) }
      : null;
    const rule = quarantineReason(snap, prev, num(ctx.limit_halalas));
    if (rule && !supplierNote?.trim()) fail("errors.snapshotNeedsNote", { supplierNote: "errors.snapshotNeedsNote" });
    const values = { ...snap, quarantined: rule !== null, quarantineReason: rule, supplierNote: supplierNote?.trim() || null, submittedBy: m.userId, submittedAt: t };
    const [existing] = await tx.select({ id: snapshots.id }).from(snapshots).where(and(eq(snapshots.lineId, lineId), eq(snapshots.period, snap.period)));
    if (existing && ctx.released) fail("errors.snapshotLocked");
    const [row] = existing
      ? await tx.update(snapshots).set({ ...values, rejected: false, reviewedAt: null, reviewedBy: null }).where(eq(snapshots.id, existing.id)).returning({ id: snapshots.id })
      : await tx.insert(snapshots).values({ lineId, ...values }).returning({ id: snapshots.id });
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "snapshot", entityId: row!.id, action: existing ? "snapshot.replaced" : "snapshot.submitted", data: { period: snap.period, quarantine: rule } });
    return { quarantined: rule !== null };
  });
}

/* ───────── Notifications ───────── */

export async function markNotificationsRead(ids?: string[]) {
  const m = await requireMember();
  const t = now();
  await getDb().transaction(async (tx) => {
    const where = and(eq(notifications.companyId, m.company.id), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined);
    const updated = await tx.update(notifications).set({ readAt: t }).where(where).returning({ id: notifications.id });
    await audit(tx, { actor: m.userId, companyId: m.company.id, entityType: "notifications", entityId: m.company.id, action: "notifications.read", data: { count: updated.length } });
  });
}

/* ───────── Ops ───────── */

export async function verifyCompany(input: { companyId: string; approve: boolean; note?: string }) {
  const s = await requireStaff();
  const t = now();
  await getDb().transaction(async (tx) => {
    const [c] = await tx
      .update(companies)
      .set(input.approve ? { status: "VERIFIED", verifiedAt: t } : { status: "SUSPENDED" })
      .where(and(eq(companies.id, input.companyId), eq(companies.status, "UNVERIFIED")))
      .returning({ id: companies.id });
    if (!c) fail("errors.notFound");
    if (input.approve) await notify(tx, [{ companyId: c!.id, kind: "COMPANY_VERIFIED", href: hrefs.company }]);
    await audit(tx, { actor: s.userId, companyId: c!.id, entityType: "company", entityId: c!.id, action: input.approve ? "company.verified" : "company.rejected", data: { note: input.note ?? null } });
  });
}

export async function decideCfo(input: { cfoId: string; approve: boolean; waiveCoolingOff?: boolean; note?: string }) {
  const s = await requireStaff();
  const t = now();
  await getDb().transaction(async (tx) => {
    const [d] = await rows<{ id: string; company_id: string }>(
      tx,
      sql`update cfo_designations set status = ${input.approve ? "APPROVED" : "REJECTED"}, decided_by = ${s.userId}, decided_at = ${t},
            decision_note = ${input.note ?? null}, effective_at = ${input.approve ? addHours(t, input.waiveCoolingOff ? 0 : CFO_COOLING_OFF_HOURS) : null}
          where id = ${input.cfoId} and status = 'NOMINATED' returning id, company_id`,
    );
    if (!d) fail("errors.notFound");
    await audit(tx, { actor: s.userId, companyId: d!.company_id, entityType: "cfo", entityId: d!.id, action: input.approve ? "cfo.approved" : "cfo.rejected", data: { waived: input.waiveCoolingOff ?? false, note: input.note ?? null } });
    if (input.approve && input.waiveCoolingOff) await activateCfos(tx, [d!.id], s.userId, t);
  });
}

export async function decideDispute(input: { disputeId: string; uphold: boolean; note: string }) {
  const s = await requireStaff();
  const t = now();
  await getDb().transaction(async (tx) => {
    const [d] = await rows<{ id: string; line_id: string; tcl_id: string; supplier_company_id: string; buyer_company_id: string }>(
      tx,
      sql`with d as (update disputes set status = ${input.uphold ? "UPHELD" : "REJECTED"}, decided_by = ${s.userId}, decided_at = ${t}, decision_note = ${input.note}
                     where id = ${input.disputeId} and status in ('OPEN', 'RESPONDED', 'ESCALATED') returning id, line_id)
          select d.id, d.line_id, l.tcl_id, l.supplier_company_id, l.buyer_company_id from d join credit_lines l on l.id = d.line_id`,
    );
    if (!d) return fail("errors.notFound");
    await tx
      .update(creditLines)
      .set(input.uphold ? { status: "VOIDED", voidedAt: t, voidReason: `Dispute upheld: ${input.note}`, suspended: false } : { suspended: false })
      .where(eq(creditLines.id, d.line_id));
    const outcome = input.uphold ? "UPHELD" : "REJECTED";
    await notify(
      tx,
      [d.supplier_company_id, d.buyer_company_id].map((companyId) => ({ companyId, kind: "DISPUTE_DECIDED" as const, lineId: d.line_id, params: { tclId: d.tcl_id, outcome }, href: hrefs.line(d.line_id) })),
    );
    await audit(tx, { actor: s.userId, companyId: d.buyer_company_id, entityType: "dispute", entityId: d.id, action: `dispute.${outcome.toLowerCase()}`, data: { note: input.note } });
  });
}

export async function decideDefault(input: { defaultId: string; decision: "UPHOLD" | "REJECT" | "REQUEST_INFO"; note: string }) {
  const s = await requireStaff();
  const t = now();
  await getDb().transaction(async (tx) => {
    const status = input.decision === "UPHOLD" ? "UPHELD" : input.decision === "REJECT" ? "REJECTED" : "INFO_REQUESTED";
    const [r] = await rows<{ id: string; line_id: string; tcl_id: string; supplier_company_id: string; buyer_company_id: string; buyer_name: string; buyer_tmc: string }>(
      tx,
      sql`with r as (update default_reports set status = ${status}, decided_by = ${s.userId}, decided_at = ${t}, decision_note = ${input.note}
                     where id = ${input.defaultId} and status in ('UNDER_REVIEW', 'INFO_REQUESTED') returning id, line_id)
          select r.id, r.line_id, l.tcl_id, l.supplier_company_id, l.buyer_company_id, b.legal_name as buyer_name, b.tmc_id as buyer_tmc
          from r join credit_lines l on l.id = r.line_id join companies b on b.id = l.buyer_company_id`,
    );
    if (!r) return fail("errors.notFound");
    let alertSent: boolean | null = null;
    const entries: Parameters<typeof notify>[1] = [
      { companyId: r.buyer_company_id, kind: "DEFAULT_DECIDED", lineId: r.line_id, params: { tclId: r.tcl_id, outcome: status }, href: hrefs.line(r.line_id) },
    ];
    if (status === "UPHELD") {
      alertSent = await buyerMeetsFloorNow(tx, r.buyer_company_id, t);
      if (alertSent) {
        const holders = await rows<{ supplier_company_id: string }>(
          tx,
          sql`select distinct supplier_company_id from credit_lines where buyer_company_id = ${r.buyer_company_id} and status = 'ACTIVE' and supplier_company_id <> ${r.supplier_company_id}`,
        );
        for (const h of holders)
          entries.push({ companyId: h.supplier_company_id, kind: "NETWORK_ALERT", params: { buyer: r.buyer_name, buyerTmcId: r.buyer_tmc, defaultId: r.id }, href: hrefs.check(r.buyer_company_id) });
      }
      await tx.execute(sql`update default_reports set alert_sent = ${alertSent} where id = ${r.id}`);
    }
    entries.push({ companyId: r.supplier_company_id, kind: "DEFAULT_DECIDED", lineId: r.line_id, params: { tclId: r.tcl_id, outcome: status, alertSent: alertSent === null ? "" : alertSent ? 1 : 0 }, href: hrefs.line(r.line_id) });
    await notify(tx, entries);
    await audit(tx, { actor: s.userId, companyId: r.buyer_company_id, entityType: "default_report", entityId: r.id, action: `default.${status.toLowerCase()}`, data: { note: input.note, alertSent } });
  });
}

export async function runScoreRelease(input?: { period?: string }): Promise<ReleaseView> {
  const s = await requireStaff();
  const t = now();
  const res = await getDb().transaction((tx) => runRelease(tx, { period: input?.period ?? latestCompletedPeriod(t), now: t, runBy: s.userId }));
  if (!res.ok) return fail(res.error);
  const r = res.release;
  return { id: r.id, period: r.period, runAt: r.runAt.toISOString(), companiesScored: r.companiesScored, companiesSuppressed: r.companiesSuppressed };
}

export async function tickNow() {
  await requireStaff();
  return runTick(getDb(), now());
}
