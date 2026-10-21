import "server-only";
import { getDb } from "@tmc/db";
import { rows } from "@tmc/db/jobs";
import type { CompanyStatus, MemberRole } from "@tmc/domain";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import type { SessionContext } from "./contracts";

/** The signed-in user with everything authorisation needs. */
export interface Viewer {
  userId: string;
  name: string;
  email: string;
  /** Sign-in time of this session (CFO re-auth rule). */
  signedInAt: Date;
  isStaff: boolean;
  company: NonNullable<SessionContext["company"]> | null;
  role: MemberRole | null;
  /** Active CFO designation of this user, if any. */
  cfo: { id: string; mobile: string } | null;
}

interface ViewerRow {
  company_id: string | null;
  tmc_id: string | null;
  legal_name: string | null;
  legal_name_ar: string | null;
  status: CompanyStatus | null;
  city: string | null;
  sector: string | null;
  cr_number: string | null;
  role: MemberRole | null;
  cfo_id: string | null;
  cfo_mobile: string | null;
  is_staff: boolean;
}

/** Session + membership + CFO + staff flag: one auth lookup and one query, once per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await rows<ViewerRow>(
    getDb(),
    sql`select c.id as company_id, c.tmc_id, c.legal_name, c.legal_name_ar, c.status, c.city, c.sector, c.cr_number, m.role,
          d.id as cfo_id, d.mobile as cfo_mobile, exists (select 1 from staff s where s.user_id = ${session.user.id}) as is_staff
        from (select 1) one
        left join memberships m on m.user_id = ${session.user.id}
        left join companies c on c.id = m.company_id
        left join cfo_designations d on d.user_id = ${session.user.id} and d.company_id = m.company_id and d.status = 'ACTIVE'`,
  );
  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    signedInAt: new Date(session.session.createdAt),
    isStaff: row?.is_staff ?? false,
    company:
      row?.company_id
        ? {
            id: row.company_id,
            tmcId: row.tmc_id!,
            legalName: row.legal_name!,
            legalNameAr: row.legal_name_ar,
            status: row.status!,
            city: row.city!,
            sector: row.sector!,
            crNumber: row.cr_number!,
          }
        : null,
    role: row?.role ?? null,
    cfo: row?.cfo_id ? { id: row.cfo_id, mobile: row.cfo_mobile! } : null,
  };
});

export const isDemoMode = () => process.env.DEMO_MODE === "true";

export function toSessionContext(v: Viewer): SessionContext {
  return {
    user: { id: v.userId, name: v.name, email: v.email },
    company: v.company,
    role: v.role,
    isCfo: v.cfo !== null,
    isStaff: v.isStaff,
    demoMode: isDemoMode(),
  };
}

/** Loaders: signed-in viewer or redirect to sign-in. */
export async function pageViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/sign-in");
  return v;
}

/** Loaders: viewer that belongs to a company (staff without one go to the ops console). */
export type Member = Viewer & { company: NonNullable<Viewer["company"]>; role: MemberRole };

export async function pageMember(): Promise<Member> {
  const v = await pageViewer();
  if (!v.company || !v.role) redirect(v.isStaff ? "/ops" : "/register");
  return v as Member;
}
