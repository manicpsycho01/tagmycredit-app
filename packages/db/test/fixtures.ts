/**
 * Test fixtures written through the owner connection (getDb()). Every fixture uses fresh random ids / CR
 * numbers, so test files never collide with each other or with leftover rows from earlier runs.
 */
import { randomInt, randomUUID } from "node:crypto";
import {
  attachments,
  auditEvents,
  buyerScores,
  cfoDesignations,
  closureRequests,
  companies,
  creditLines,
  creditLineVersions,
  defaultReports,
  disputes,
  getDb,
  memberships,
  notifications,
  projectLinks,
  projectMembers,
  projects,
  scoreReleases,
  snapshots,
  user,
} from "../src/index";

type CompanyStatus = "UNVERIFIED" | "VERIFIED" | "SUSPENDED";

export const uid = () => randomUUID();
export const randomCr = () => String(randomInt(1_000_000_000, 9_999_999_999));
export const randomTmcId = () => `TMC-SA-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}-${String(randomInt(1, 99)).padStart(2, "0")}-${randomUUID().slice(0, 6).toUpperCase()}`;
export const randomMobile = () => `+9665${String(randomInt(0, 99_999_999)).padStart(8, "0")}`;
let tclSeq = randomInt(1, 9_000_000);
export const nextTcl = () => `TCL-SA-T${String(tclSeq++).padStart(7, "0")}-${randomUUID().slice(0, 4)}`;

export async function makeUser(name = "Test User") {
  const id = `u_${randomUUID()}`;
  await getDb().insert(user).values({ id, name, email: `${id}@test.local` });
  return id;
}

export async function makeCompany(opts: { status?: CompanyStatus; name?: string } = {}) {
  const [row] = await getDb()
    .insert(companies)
    .values({
      tmcId: randomTmcId(),
      legalName: opts.name ?? `Co ${randomUUID().slice(0, 8)}`,
      crNumber: randomCr(),
      city: "Riyadh",
      sector: "Construction",
      status: opts.status ?? "VERIFIED",
    })
    .returning();
  return row!;
}

export async function makeMember(companyId: string, role: "OWNER" | "ADMIN" | "CREDIT_MANAGER" | "VIEWER" = "OWNER") {
  const userId = await makeUser();
  await getDb().insert(memberships).values({ companyId, userId, role });
  return userId;
}

export async function makeCfo(companyId: string, userId: string, status: "NOMINATED" | "APPROVED" | "ACTIVE" | "REJECTED" | "ENDED" = "ACTIVE") {
  const [row] = await getDb()
    .insert(cfoDesignations)
    .values({ companyId, userId, mobile: randomMobile(), title: "CFO", status, nominatedBy: userId })
    .returning();
  return row!;
}

export async function makeLine(
  supplierId: string,
  buyerId: string,
  opts: { status?: "PENDING" | "ACTIVE" | "DECLINED" | "EXPIRED" | "CLOSED" | "VOIDED"; limit?: number } = {},
) {
  const db = getDb();
  const status = opts.status ?? "ACTIVE";
  const [line] = await db
    .insert(creditLines)
    .values({
      tclId: nextTcl(),
      supplierCompanyId: supplierId,
      buyerCompanyId: buyerId,
      status,
      currentVersion: status === "PENDING" ? null : 1,
      createdBy: "u_test",
    })
    .returning();
  const [version] = await db
    .insert(creditLineVersions)
    .values({
      lineId: line!.id,
      version: 1,
      limitHalalas: opts.limit ?? 100_000_00,
      termsDays: 60,
      effectiveDate: "2025-01-01",
      attestation: "Test attestation",
      status: status === "PENDING" ? "PENDING" : "CONFIRMED",
      proposedBy: "u_test",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    })
    .returning();
  return { line: line!, version: version! };
}

export async function makeSnapshot(lineId: string, period = "2025-06-01", outstanding = 50_000_00) {
  const [row] = await getDb()
    .insert(snapshots)
    .values({
      lineId,
      period,
      outstanding,
      notDue: outstanding,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d90Plus: 0,
      settledTotal: 10_000_00,
      settledOnTime: 9_000_00,
      submittedBy: "u_test",
    })
    .returning();
  return row!;
}

/** A complete set of rows around one line: snapshot, dispute, closure, default, attachments, notifications. */
export async function makeLineWorld(supplierId: string, buyerId: string) {
  const db = getDb();
  const { line, version } = await makeLine(supplierId, buyerId);
  const snapshot = await makeSnapshot(line.id);
  const respondBy = new Date("2030-01-01T00:00:00Z");
  const [dispute] = await db.insert(disputes).values({ lineId: line.id, raisedBy: "u_b", reason: "wrong", respondBy }).returning();
  const [closure] = await db.insert(closureRequests).values({ lineId: line.id, requestedBy: "u_b", reason: "ended", respondBy }).returning();
  const [dflt] = await db
    .insert(defaultReports)
    .values({ lineId: line.id, reportedBy: "u_s", amountHalalas: 1_000_00, oldestDueDate: "2025-01-01", note: "unpaid", buyerReplyBy: respondBy })
    .returning();
  const [disputeDoc] = await db
    .insert(attachments)
    .values({ companyId: buyerId, ownerType: "dispute", ownerId: dispute!.id, fileName: "d.pdf", mimeType: "application/pdf", sizeBytes: 3, content: Buffer.from("pdf"), uploadedBy: "u_b" })
    .returning();
  const [defaultDoc] = await db
    .insert(attachments)
    .values({ companyId: supplierId, ownerType: "default", ownerId: dflt!.id, fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 3, content: Buffer.from("pdf"), uploadedBy: "u_s" })
    .returning();
  const [supplierNote] = await db.insert(notifications).values({ companyId: supplierId, kind: "LINE_CONFIRMED", lineId: line.id }).returning();
  const [buyerNote] = await db.insert(notifications).values({ companyId: buyerId, kind: "DEFAULT_FILED", lineId: line.id }).returning();
  return { line, version, snapshot, dispute: dispute!, closure: closure!, dflt: dflt!, disputeDoc: disputeDoc!, defaultDoc: defaultDoc!, supplierNote: supplierNote!, buyerNote: buyerNote! };
}

export async function makeProject(ownerId: string, members: { companyId: string; tier: number }[], links: [string, string][]) {
  const db = getDb();
  const [project] = await db.insert(projects).values({ ownerCompanyId: ownerId, name: "P", location: "Jeddah", createdBy: "u_test" }).returning();
  if (members.length) await db.insert(projectMembers).values(members.map((m) => ({ projectId: project!.id, ...m })));
  if (links.length) await db.insert(projectLinks).values(links.map(([payer, payee]) => ({ projectId: project!.id, payerCompanyId: payer, payeeCompanyId: payee })));
  return project!;
}

export async function makeScore(companyId: string) {
  const db = getDb();
  // score_releases.period is unique: use a far-future, random period so tests never collide with real releases.
  const period = `${2100 + randomInt(0, 800)}-${String(randomInt(1, 13)).padStart(2, "0")}-01`;
  const [release] = await db.insert(scoreReleases).values({ period }).onConflictDoNothing().returning();
  const rel = release ?? (await db.query.scoreReleases.findFirst({ where: (r, { eq }) => eq(r.period, period) }))!;
  const [score] = await db
    .insert(buyerScores)
    .values({ releaseId: rel.id, companyId, published: true, score: 720, band: "GOOD", light: "GREEN", cohortHash: "secret-hash" })
    .returning();
  return score!;
}

export async function makeAudit(companyId: string) {
  const [row] = await getDb()
    .insert(auditEvents)
    .values({ companyId, entityType: "company", entityId: companyId, action: "test" })
    .returning();
  return row!;
}

/** Postgres SQLSTATE + constraint of a failed query (drizzle wraps the pg error in `cause`). */
export async function pgError(p: Promise<unknown>): Promise<{ code: string; constraint?: string; message: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { code?: string; constraint?: string; message: string; cause?: { code?: string; constraint?: string; message: string } };
    const c = err.cause && err.cause.code ? err.cause : err;
    return { code: c.code ?? "?", constraint: c.constraint, message: c.message };
  }
}
