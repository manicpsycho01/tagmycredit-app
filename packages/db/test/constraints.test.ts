/** Database-level guards (last line of defence behind the services). SPEC §1, §2, §4. */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  attachments,
  cfoDesignations,
  closeDb,
  closureRequests,
  companies,
  creditLines,
  creditLineVersions,
  defaultReports,
  disputes,
  getDb,
  memberships,
  projectMembers,
  snapshots,
} from "../src/index";
import { makeCfo, makeCompany, makeLine, makeMember, makeProject, makeSnapshot, nextTcl, pgError, randomCr, randomMobile, randomTmcId } from "./fixtures";

const db = () => getDb();
afterAll(closeDb);

describe("companies", () => {
  it.each(["123456789", "12345678901", "12345abcde", "", "١٢٣٤٥٦٧٨٩٠"])("rejects CR %j", async (cr) => {
    const e = await pgError(db().insert(companies).values({ tmcId: randomTmcId(), legalName: "x", crNumber: cr, city: "R", sector: "S" }));
    expect(e?.constraint).toBe("cr_number_format");
  });
  it("accepts a 10-digit CR, rejects duplicates of CR and TMC-ID", async () => {
    const c = await makeCompany();
    const dupCr = await pgError(db().insert(companies).values({ tmcId: randomTmcId(), legalName: "x", crNumber: c.crNumber, city: "R", sector: "S" }));
    expect(dupCr?.code).toBe("23505");
    const dupId = await pgError(db().insert(companies).values({ tmcId: c.tmcId, legalName: "x", crNumber: randomCr(), city: "R", sector: "S" }));
    expect(dupId?.code).toBe("23505");
  });
  it("defaults to UNVERIFIED", async () => {
    const [c] = await db().insert(companies).values({ tmcId: randomTmcId(), legalName: "x", crNumber: randomCr(), city: "R", sector: "S" }).returning();
    expect(c!.status).toBe("UNVERIFIED");
  });
});

describe("memberships", () => {
  it("one user belongs to exactly one company (A9)", async () => {
    const [a, b] = await Promise.all([makeCompany(), makeCompany()]);
    const u = await makeMember(a.id);
    const e = await pgError(db().insert(memberships).values({ companyId: b.id, userId: u, role: "VIEWER" }));
    expect(e?.code).toBe("23505");
  });
});

describe("CFO designations", () => {
  let co: Awaited<ReturnType<typeof makeCompany>>;
  beforeAll(async () => {
    co = await makeCompany();
  });
  it.each(["0512345678", "+966412345678", "+96651234567", "+9665123456789", "+966 512345678", "966512345678"])("rejects mobile %j", async (mobile) => {
    const u = await makeMember(co.id);
    const e = await pgError(db().insert(cfoDesignations).values({ companyId: co.id, userId: u, mobile, title: "CFO", nominatedBy: u, status: "REJECTED" }));
    expect(e?.constraint).toBe("cfo_mobile_format");
  });
  it("accepts +9665XXXXXXXX", async () => {
    const u = await makeMember(co.id);
    expect(await pgError(db().insert(cfoDesignations).values({ companyId: co.id, userId: u, mobile: "+966512345678", title: "CFO", nominatedBy: u, status: "ENDED" }))).toBeNull();
  });
  it("only one ACTIVE CFO per company", async () => {
    const c = await makeCompany();
    await makeCfo(c.id, await makeMember(c.id));
    const e = await pgError(makeCfo(c.id, await makeMember(c.id)));
    expect(e?.constraint).toBe("one_active_cfo_per_company");
    // ENDED / REJECTED rows can co-exist
    expect(await pgError(makeCfo(c.id, await makeMember(c.id), "ENDED"))).toBeNull();
    expect(await pgError(makeCfo(c.id, await makeMember(c.id), "REJECTED"))).toBeNull();
  });
  it("only one open (NOMINATED/APPROVED) nomination per company", async () => {
    const c = await makeCompany();
    await makeCfo(c.id, await makeMember(c.id), "NOMINATED");
    const e = await pgError(makeCfo(c.id, await makeMember(c.id), "APPROVED"));
    expect(e?.constraint).toBe("one_open_cfo_nomination_per_company");
  });
});

describe("credit lines", () => {
  it("a company cannot have a line with itself", async () => {
    const c = await makeCompany();
    const e = await pgError(makeLine(c.id, c.id));
    expect(e?.constraint).toBe("line_parties_differ");
  });
  it("one open (PENDING/ACTIVE) line per supplier–buyer pair; a new one is allowed after close", async () => {
    const [s, b] = await Promise.all([makeCompany(), makeCompany()]);
    const { line } = await makeLine(s.id, b.id, { status: "PENDING" });
    const e = await pgError(makeLine(s.id, b.id, { status: "ACTIVE" }));
    expect(e?.constraint).toBe("one_open_line_per_pair");
    // reverse direction is a different pair
    expect(await pgError(makeLine(b.id, s.id))).toBeNull();
    await db().update(creditLines).set({ status: "CLOSED" }).where(eq(creditLines.id, line.id));
    expect(await pgError(makeLine(s.id, b.id))).toBeNull();
  });

  const version = (lineId: string, v: number, limitHalalas: number, termsDays: number, status: "PENDING" | "SUPERSEDED" = "SUPERSEDED") =>
    db().insert(creditLineVersions).values({
      lineId,
      version: v,
      limitHalalas,
      termsDays,
      effectiveDate: "2025-01-01",
      attestation: "a",
      status,
      proposedBy: "u",
      expiresAt: new Date("2030-01-01"),
    });

  it("limit must be SAR 10,000 – 500,000,000 (in halalas)", async () => {
    const [s, b] = await Promise.all([makeCompany(), makeCompany()]);
    const { line } = await makeLine(s.id, b.id);
    expect((await pgError(version(line.id, 2, 999_999, 30)))?.constraint).toBe("limit_range");
    expect(await pgError(version(line.id, 3, 1_000_000, 30))).toBeNull(); // SAR 10,000
    expect(await pgError(version(line.id, 4, 50_000_000_000, 30))).toBeNull(); // SAR 500,000,000
    expect((await pgError(version(line.id, 5, 50_000_000_001, 30)))?.constraint).toBe("limit_range");
  });

  it("terms must be 30/45/60/90/120", async () => {
    const [s, b] = await Promise.all([makeCompany(), makeCompany()]);
    const { line } = await makeLine(s.id, b.id);
    let v = 10;
    for (const t of [30, 45, 60, 90, 120]) expect(await pgError(version(line.id, v++, 1_000_000, t))).toBeNull();
    for (const t of [0, 15, 31, 100, 180]) expect((await pgError(version(line.id, v++, 1_000_000, t)))?.constraint).toBe("terms_allowed");
  });

  it("unique version number per line, max one PENDING version per line", async () => {
    const [s, b] = await Promise.all([makeCompany(), makeCompany()]);
    const { line } = await makeLine(s.id, b.id); // v1 CONFIRMED
    expect((await pgError(version(line.id, 1, 1_000_000, 30)))?.constraint).toBe("line_version_unique");
    expect(await pgError(version(line.id, 2, 1_000_000, 30, "PENDING"))).toBeNull();
    expect((await pgError(version(line.id, 3, 1_000_000, 30, "PENDING")))?.constraint).toBe("one_pending_version_per_line");
  });

  it("TCL-ID is unique", async () => {
    const [s, b, c] = await Promise.all([makeCompany(), makeCompany(), makeCompany()]);
    const { line } = await makeLine(s.id, b.id);
    const e = await pgError(db().insert(creditLines).values({ tclId: line.tclId, supplierCompanyId: s.id, buyerCompanyId: c.id, createdBy: "u" }));
    expect(e?.code).toBe("23505");
  });
});

describe("snapshots", () => {
  let lineId: string;
  beforeAll(async () => {
    const [s, b] = await Promise.all([makeCompany(), makeCompany()]);
    lineId = (await makeLine(s.id, b.id)).line.id;
  });
  const base = { outstanding: 1000, notDue: 400, d1_30: 300, d31_60: 200, d61_90: 50, d90Plus: 50, settledTotal: 500, settledOnTime: 500, submittedBy: "u" };
  let month = 1;
  const nextPeriod = () => `2020-${String(month++).padStart(2, "0")}-01`;

  it("accepts a valid snapshot (buckets sum to outstanding, on-time = total)", async () => {
    expect(await pgError(db().insert(snapshots).values({ ...base, lineId, period: nextPeriod() }))).toBeNull();
  });
  it("buckets must sum to outstanding", async () => {
    const e = await pgError(db().insert(snapshots).values({ ...base, outstanding: 1001, lineId, period: nextPeriod() }));
    expect(e?.constraint).toBe("snapshot_buckets_sum");
  });
  it("settled on time ≤ settled total", async () => {
    const e = await pgError(db().insert(snapshots).values({ ...base, settledOnTime: 501, lineId, period: nextPeriod() }));
    expect(e?.constraint).toBe("snapshot_on_time_le_total");
  });
  it("no negative amounts", async () => {
    const e = await pgError(db().insert(snapshots).values({ ...base, notDue: 800, d1_30: -100, lineId, period: nextPeriod() }));
    expect(e?.constraint).toBe("snapshot_non_negative");
  });
  it("period must be the first of a month", async () => {
    const e = await pgError(db().insert(snapshots).values({ ...base, lineId, period: "2020-06-15" }));
    expect(e?.constraint).toBe("snapshot_period_first_of_month");
  });
  it("one snapshot per line per period", async () => {
    const p = nextPeriod();
    await makeSnapshot(lineId, p);
    const e = await pgError(makeSnapshot(lineId, p));
    expect(e?.constraint).toBe("snapshot_line_period");
  });
});

describe("disputes, closures, defaults, attachments, projects", () => {
  it("one open dispute and one open closure request per line", async () => {
    const [s, b] = await Promise.all([makeCompany(), makeCompany()]);
    const { line } = await makeLine(s.id, b.id);
    const respondBy = new Date("2030-01-01");
    await db().insert(disputes).values({ lineId: line.id, raisedBy: "u", reason: "r", respondBy });
    for (const status of ["OPEN", "RESPONDED", "ESCALATED"] as const) {
      expect((await pgError(db().insert(disputes).values({ lineId: line.id, raisedBy: "u", reason: "r", respondBy, status })))?.constraint).toBe("one_open_dispute_per_line");
    }
    expect(await pgError(db().insert(disputes).values({ lineId: line.id, raisedBy: "u", reason: "r", respondBy, status: "REJECTED" }))).toBeNull();
    await db().insert(closureRequests).values({ lineId: line.id, requestedBy: "u", reason: "r", respondBy });
    expect((await pgError(db().insert(closureRequests).values({ lineId: line.id, requestedBy: "u", reason: "r", respondBy })))?.constraint).toBe("one_open_closure_per_line");
  });
  it("default amount must be positive", async () => {
    const [s, b] = await Promise.all([makeCompany(), makeCompany()]);
    const { line } = await makeLine(s.id, b.id);
    const e = await pgError(db().insert(defaultReports).values({ lineId: line.id, reportedBy: "u", amountHalalas: 0, oldestDueDate: "2025-01-01", note: "n", buyerReplyBy: new Date() }));
    expect(e?.constraint).toBe("default_amount_positive");
  });
  it("attachments are 1 byte – 5 MB", async () => {
    const c = await makeCompany();
    const a = (sizeBytes: number) => db().insert(attachments).values({ companyId: c.id, ownerType: "cfo", fileName: "f", mimeType: "application/pdf", sizeBytes, content: Buffer.from("x"), uploadedBy: "u" });
    expect(await pgError(a(5_242_880))).toBeNull();
    expect((await pgError(a(5_242_881)))?.constraint).toBe("attachment_size");
    expect((await pgError(a(0)))?.constraint).toBe("attachment_size");
  });
  it("project tiers are 0–3 and links need two different companies", async () => {
    const [o, m] = await Promise.all([makeCompany(), makeCompany()]);
    const p = await makeProject(o.id, [], []);
    expect((await pgError(db().insert(projectMembers).values({ projectId: p.id, companyId: m.id, tier: 4 })))?.constraint).toBe("tier_range");
    expect((await pgError(db().insert(projectMembers).values({ projectId: p.id, companyId: m.id, tier: -1 })))?.constraint).toBe("tier_range");
    const e = await pgError(makeProject(o.id, [], [[m.id, m.id]]));
    expect(e?.constraint).toBe("link_parties_differ");
  });
});

describe("helpers sanity", () => {
  it("fixtures generate valid mobiles and TCL ids", async () => {
    expect(randomMobile()).toMatch(/^\+9665\d{8}$/);
    expect(nextTcl()).toMatch(/^TCL-SA-/);
    const r = await getDb().execute(sql`select 1 as one`);
    expect(r.rows[0]).toEqual({ one: 1 });
  });
});
