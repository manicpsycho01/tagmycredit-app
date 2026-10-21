import "server-only";
import type { Tx } from "@tmc/db";
import { iso, isoOrNull, rows } from "@tmc/db/jobs";
import { maskMobile, type CfoStatus, type MemberRole } from "@tmc/domain";
import { sql } from "drizzle-orm";
import type { CfoView, CompanyPage } from "../contracts";
import type { Member } from "../guard";

export interface CfoRow {
  id: string;
  user_id: string;
  name: string;
  mobile: string;
  title: string;
  status: CfoStatus;
  effective_at: Date | null;
  created_at: Date;
}
export const toCfoView = (c: CfoRow): CfoView => ({
  id: c.id,
  userId: c.user_id,
  name: c.name,
  mobileMasked: maskMobile(c.mobile),
  title: c.title,
  status: c.status,
  effectiveAt: isoOrNull(c.effective_at),
  createdAt: iso(c.created_at),
});

export async function companyPage(tx: Tx, v: Member): Promise<CompanyPage> {
  const id = v.company.id;
  const [[company], members, cfos] = await Promise.all([
    rows<{ created_at: Date; verified_at: Date | null }>(tx, sql`select created_at, verified_at from companies where id = ${id}`),
    rows<{ user_id: string; name: string; email: string; role: MemberRole; title: string | null; is_cfo: boolean }>(
      tx,
      sql`select m.user_id, u.name, u.email, m.role, m.title,
            exists (select 1 from cfo_designations d where d.user_id = m.user_id and d.company_id = m.company_id and d.status = 'ACTIVE') as is_cfo
          from memberships m join "user" u on u.id = m.user_id where m.company_id = ${id} order by m.created_at`,
    ),
    rows<CfoRow>(
      tx,
      sql`select d.id, d.user_id, u.name, d.mobile, d.title, d.status, d.effective_at, d.created_at
          from cfo_designations d join "user" u on u.id = d.user_id
          where d.company_id = ${id} and d.status in ('NOMINATED', 'APPROVED', 'ACTIVE')`,
    ),
  ]);
  const active = cfos.find((c) => c.status === "ACTIVE");
  const pending = cfos.find((c) => c.status !== "ACTIVE");
  return {
    company: { ...v.company, createdAt: iso(company!.created_at), verifiedAt: isoOrNull(company!.verified_at) },
    members: members.map((m) => ({ userId: m.user_id, name: m.name, email: m.email, role: m.role, title: m.title, isCfo: m.is_cfo })),
    activeCfo: active ? toCfoView(active) : null,
    pendingCfo: pending ? toCfoView(pending) : null,
  };
}
