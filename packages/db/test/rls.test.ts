/**
 * Tenant isolation (DECISIONS A2, A4): reads through withTenant() see only the viewer company's data.
 * World:
 *   A (supplier) ──line──▶ B (buyer)          A owns project P_A with member E
 *   C (supplier) ──line──▶ D (buyer)          D owns project P_D with member F
 *   X: unrelated company, no links.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, withTenant, type Tx } from "../src/index";
import {
  makeAudit,
  makeCfo,
  makeCompany,
  makeLineWorld,
  makeMember,
  makeProject,
  makeScore,
  pgError,
} from "./fixtures";

type Row = Record<string, unknown>;
const rows = async (tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute(q)).rows as Row[];
const asTenant = <T>(companyId: string, fn: (tx: Tx) => Promise<T>) => withTenant(companyId, fn);

let A: Awaited<ReturnType<typeof makeCompany>>, B: typeof A, C: typeof A, D: typeof A, E: typeof A, F: typeof A, X: typeof A;
let ab: Awaited<ReturnType<typeof makeLineWorld>>, cd: typeof ab;
let userA: string, userB: string, userC: string;
let projA: Awaited<ReturnType<typeof makeProject>>, projD: typeof projA;
let scoreB: Awaited<ReturnType<typeof makeScore>>;

beforeAll(async () => {
  [A, B, C, D, E, F, X] = await Promise.all([
    makeCompany({ name: "A supplier" }),
    makeCompany({ name: "B buyer" }),
    makeCompany({ name: "C supplier" }),
    makeCompany({ name: "D buyer" }),
    makeCompany({ name: "E project member" }),
    makeCompany({ name: "F project member" }),
    makeCompany({ name: "X unrelated" }),
  ]);
  userA = await makeMember(A.id);
  userB = await makeMember(B.id);
  userC = await makeMember(C.id);
  await makeMember(D.id);
  await makeCfo(B.id, userB);
  const userD = await makeMember(D.id, "ADMIN");
  await makeCfo(D.id, userD);
  ab = await makeLineWorld(A.id, B.id);
  cd = await makeLineWorld(C.id, D.id);
  projA = await makeProject(A.id, [{ companyId: A.id, tier: 0 }, { companyId: E.id, tier: 1 }], [[A.id, E.id]]);
  projD = await makeProject(D.id, [{ companyId: D.id, tier: 0 }, { companyId: F.id, tier: 1 }], [[D.id, F.id]]);
  scoreB = await makeScore(B.id);
  await makeAudit(A.id);
});

afterAll(async () => {
  await closeDb();
});

describe("withTenant basics", () => {
  it("runs as tmc_app with the company id set, and resets after the transaction", async () => {
    const r = await asTenant(A.id, (tx) => rows(tx, sql`select current_user as u, app_company() as c`));
    expect(r[0]).toEqual({ u: "tmc_app", c: A.id });
    const after = (await getDb().execute(sql`select current_user as u, current_setting('app.company_id', true) as c`)).rows[0] as Row;
    expect(after.u).not.toBe("tmc_app");
    expect(after.c ?? "").toBe("");
  });
});

describe("credit lines and line children are visible only to the two parties", () => {
  const tables = [
    ["credit_lines", "id", (w: typeof ab) => w.line.id],
    ["credit_line_versions", "id", (w: typeof ab) => w.version.id],
    ["snapshots", "id", (w: typeof ab) => w.snapshot.id],
    ["disputes", "id", (w: typeof ab) => w.dispute.id],
    ["closure_requests", "id", (w: typeof ab) => w.closure.id],
    ["default_reports", "id", (w: typeof ab) => w.dflt.id],
  ] as const;

  for (const [table, col, pick] of tables) {
    it(`${table}: supplier and buyer see their row; others do not`, async () => {
      const q = (id: string) => sql`select ${sql.identifier(col)} from ${sql.identifier(table)} where ${sql.identifier(col)} = ${id}`;
      expect(await asTenant(A.id, (tx) => rows(tx, q(pick(ab))))).toHaveLength(1);
      expect(await asTenant(B.id, (tx) => rows(tx, q(pick(ab))))).toHaveLength(1);
      expect(await asTenant(A.id, (tx) => rows(tx, q(pick(cd))))).toHaveLength(0);
      expect(await asTenant(B.id, (tx) => rows(tx, q(pick(cd))))).toHaveLength(0);
      expect(await asTenant(X.id, (tx) => rows(tx, q(pick(ab))))).toHaveLength(0);
      // project membership does not grant line visibility
      expect(await asTenant(E.id, (tx) => rows(tx, q(pick(ab))))).toHaveLength(0);
    });
  }

  it("an unfiltered scan of credit_lines returns only lines where the viewer is a party", async () => {
    const r = await asTenant(A.id, (tx) => rows(tx, sql`select supplier_company_id s, buyer_company_id b from credit_lines`));
    expect(r.length).toBeGreaterThan(0);
    for (const l of r) expect([l.s, l.b]).toContain(A.id);
  });

  it("an unfiltered scan of snapshots returns only the viewer's lines", async () => {
    const r = await asTenant(B.id, (tx) => rows(tx, sql`select line_id from snapshots`));
    expect(r.map((x) => x.line_id)).toEqual([ab.line.id]);
  });
});

describe("company-scoped tables", () => {
  it("notifications: only own company", async () => {
    const a = await asTenant(A.id, (tx) => rows(tx, sql`select id, company_id from notifications`));
    expect(a.map((n) => n.id)).toEqual([ab.supplierNote.id]);
    const b = await asTenant(B.id, (tx) => rows(tx, sql`select id from notifications`));
    expect(b.map((n) => n.id)).toEqual([ab.buyerNote.id]);
  });

  it("memberships: only own company", async () => {
    const r = await asTenant(A.id, (tx) => rows(tx, sql`select company_id from memberships`));
    expect(r.length).toBe(1);
    expect(r.every((m) => m.company_id === A.id)).toBe(true);
  });

  it("users: only own company's members; other companies' users invisible even when linked", async () => {
    const r = await asTenant(A.id, (tx) => rows(tx, sql`select id from "user"`));
    expect(r.map((u) => u.id)).toEqual([userA]);
    expect(await asTenant(A.id, (tx) => rows(tx, sql`select id from "user" where id = ${userB}`))).toHaveLength(0);
    expect(await asTenant(A.id, (tx) => rows(tx, sql`select id from "user" where id = ${userC}`))).toHaveLength(0);
  });

  it("users: only id/name/email columns are readable", async () => {
    const e = await pgError(asTenant(A.id, (tx) => rows(tx, sql`select created_at from "user"`)));
    expect(e?.code).toBe("42501");
  });

  it("cfo_designations: only own company", async () => {
    expect(await asTenant(A.id, (tx) => rows(tx, sql`select id from cfo_designations`))).toHaveLength(0);
    const b = await asTenant(B.id, (tx) => rows(tx, sql`select company_id from cfo_designations`));
    expect(b.length).toBe(1);
    expect(b[0]!.company_id).toBe(B.id);
  });

  it("projects, project_members, project_links: only the owner's projects", async () => {
    const p = await asTenant(A.id, (tx) => rows(tx, sql`select id from projects`));
    expect(p.map((x) => x.id)).toEqual([projA.id]);
    const m = await asTenant(A.id, (tx) => rows(tx, sql`select project_id from project_members`));
    expect(new Set(m.map((x) => x.project_id))).toEqual(new Set([projA.id]));
    const l = await asTenant(A.id, (tx) => rows(tx, sql`select project_id from project_links`));
    expect(l.map((x) => x.project_id)).toEqual([projA.id]);
    // a project member does not see the project it was added to
    expect(await asTenant(E.id, (tx) => rows(tx, sql`select id from projects`))).toHaveLength(0);
    expect(await asTenant(A.id, (tx) => rows(tx, sql`select id from projects where id = ${projD.id}`))).toHaveLength(0);
  });
});

describe("companies directory", () => {
  const visible = async (viewer: string, target: string) =>
    (await asTenant(viewer, (tx) => rows(tx, sql`select id from companies where id = ${target}`))).length === 1;

  it("own company is visible", async () => {
    expect(await visible(A.id, A.id)).toBe(true);
  });
  it("counterparties are visible to each other only when linked by a line", async () => {
    expect(await visible(A.id, B.id)).toBe(true);
    expect(await visible(B.id, A.id)).toBe(true);
    expect(await visible(A.id, C.id)).toBe(false);
    expect(await visible(A.id, D.id)).toBe(false);
    expect(await visible(B.id, C.id)).toBe(false);
    expect(await visible(X.id, A.id)).toBe(false);
  });
  it("members of the viewer's own projects are visible; members of others' projects are not", async () => {
    expect(await visible(A.id, E.id)).toBe(true);
    expect(await visible(A.id, F.id)).toBe(false);
    // E is in A's project, but that does not let E see A
    expect(await visible(E.id, A.id)).toBe(false);
  });
  it("a full scan never leaks unrelated companies", async () => {
    const r = await asTenant(X.id, (tx) => rows(tx, sql`select id from companies`));
    expect(r.map((c) => c.id)).toEqual([X.id]);
  });
  it("no tenant set → nothing visible", async () => {
    const r = await getDb().transaction(async (tx) => {
      await tx.execute(sql`set local role tmc_app`);
      return rows(tx, sql`select id from companies`);
    });
    expect(r).toHaveLength(0);
  });
});

describe("attachments", () => {
  it("metadata visible to the line's parties, file bytes never readable by tmc_app", async () => {
    const r = await asTenant(A.id, (tx) => rows(tx, sql`select id from attachments where id in (${ab.disputeDoc.id}, ${ab.defaultDoc.id})`));
    expect(r).toHaveLength(2);
    const e = await pgError(asTenant(A.id, (tx) => rows(tx, sql`select content from attachments`)));
    expect(e?.code).toBe("42501");
  });
  it("other companies' attachments are invisible", async () => {
    const r = await asTenant(A.id, (tx) => rows(tx, sql`select id from attachments where id in (${cd.disputeDoc.id}, ${cd.defaultDoc.id})`));
    expect(r).toHaveLength(0);
  });
});

describe("buyer_scores", () => {
  it("published score columns readable by any company", async () => {
    const r = await asTenant(X.id, (tx) => rows(tx, sql`select score, band, light from buyer_scores where id = ${scoreB.id}`));
    expect(r).toEqual([{ score: 720, band: "GOOD", light: "GREEN" }]);
  });
  it("cohort_hash is never readable (column privilege)", async () => {
    const e = await pgError(asTenant(B.id, (tx) => rows(tx, sql`select cohort_hash from buyer_scores`)));
    expect(e?.code).toBe("42501");
    const star = await pgError(asTenant(B.id, (tx) => rows(tx, sql`select * from buyer_scores`)));
    expect(star?.code).toBe("42501");
  });
});

describe("lookup_company: exact TMC-ID or CR only (A2)", () => {
  const lookup = (viewer: string, q: string) => asTenant(viewer, (tx) => rows(tx, sql`select id, tmc_id from lookup_company(${q})`));

  it("exact TMC-ID matches (case/whitespace tolerant)", async () => {
    expect((await lookup(X.id, C.tmcId)).map((r) => r.id)).toEqual([C.id]);
    expect((await lookup(X.id, `  ${C.tmcId.toLowerCase()} `)).map((r) => r.id)).toEqual([C.id]);
  });
  it("exact CR matches", async () => {
    expect((await lookup(X.id, C.crNumber)).map((r) => r.id)).toEqual([C.id]);
  });
  it("partial / wildcard / name queries return nothing", async () => {
    for (const q of [C.tmcId.slice(0, -1), C.crNumber.slice(0, 9), `${C.crNumber}0`, "%", "TMC-SA-%", "_%", C.legalName, "", "' or 1=1 --"]) {
      expect(await lookup(X.id, q), `query ${JSON.stringify(q)}`).toHaveLength(0);
    }
  });
  it("returns only directory fields (no CR number)", async () => {
    const r = await asTenant(X.id, (tx) => rows(tx, sql`select * from lookup_company(${C.tmcId})`));
    expect(Object.keys(r[0]!).sort()).toEqual(["city", "id", "legal_name", "legal_name_ar", "sector", "status", "tmc_id"]);
  });
});

describe("tmc_app is read-only", () => {
  const writable = [
    "companies", "memberships", "cfo_designations", "credit_lines", "credit_line_versions", "snapshots", "disputes",
    "closure_requests", "default_reports", "score_releases", "buyer_scores", "projects", "project_members",
    "project_links", "notifications", "attachments", "audit_events", "outbox", "otp_challenges", "user", "session",
    "account", "verification", "staff",
  ];
  for (const t of writable) {
    it(`${t}: INSERT, UPDATE and DELETE denied`, async () => {
      const ins = await pgError(asTenant(A.id, (tx) => tx.execute(sql`insert into ${sql.identifier(t)} default values`)));
      expect(ins?.code, `insert ${t}: ${ins?.message}`).toBe("42501");
      const col = { project_members: "tier", project_links: "project_id", staff: "user_id", audit_events: "action" }[t] ?? "id";
      const upd = await pgError(asTenant(A.id, (tx) => tx.execute(sql`update ${sql.identifier(t)} set ${sql.identifier(col)} = ${sql.identifier(col)}`)));
      expect(upd?.code, `update ${t}: ${upd?.message}`).toBe("42501");
      const del = await pgError(asTenant(A.id, (tx) => tx.execute(sql`delete from ${sql.identifier(t)}`)));
      expect(del?.code, `delete ${t}: ${del?.message}`).toBe("42501");
    });
  }
  it("cannot TRUNCATE", async () => {
    const e = await pgError(asTenant(A.id, (tx) => tx.execute(sql`truncate notifications`)));
    expect(e?.code).toBe("42501");
  });
  it("internal tables are not even readable: otp_challenges, outbox, audit_events, session, account, verification, staff", async () => {
    for (const t of ["otp_challenges", "outbox", "audit_events", "session", "account", "verification", "staff"]) {
      const e = await pgError(asTenant(A.id, (tx) => tx.execute(sql`select 1 from ${sql.identifier(t)} limit 1`)));
      expect(e?.code, t).toBe("42501");
    }
  });
});

describe("audit_events is append-only", () => {
  it("owner connection can insert but not update or delete", async () => {
    const ev = await makeAudit(A.id);
    const upd = await pgError(getDb().execute(sql`update audit_events set action = 'x' where id = ${ev.id}`));
    expect(upd?.message).toMatch(/append-only/);
    const del = await pgError(getDb().execute(sql`delete from audit_events where id = ${ev.id}`));
    expect(del?.message).toMatch(/append-only/);
  });
});
