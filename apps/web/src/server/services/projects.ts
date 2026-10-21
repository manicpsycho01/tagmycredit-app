import "server-only";
import type { Tx } from "@tmc/db";
import { rows } from "@tmc/db/jobs";
import { sql } from "drizzle-orm";
import type { ProjectMap, ProjectSummary } from "../contracts";
import { badge, LATEST_SCORES } from "./scores";

export async function projectList(tx: Tx, companyId: string): Promise<ProjectSummary[]> {
  const list = await rows<{ id: string; name: string; location: string; companies: number; red: number; yellow: number }>(
    tx,
    sql`select p.id, p.name, p.location, count(m.company_id)::int as companies,
          count(*) filter (where sc.published and sc.light = 'RED')::int as red,
          count(*) filter (where sc.published and sc.light = 'YELLOW')::int as yellow
        from projects p
        left join project_members m on m.project_id = p.id
        left join ${LATEST_SCORES} sc on sc.company_id = m.company_id
        where p.owner_company_id = ${companyId}
        group by p.id order by p.created_at desc`,
  );
  return list;
}

export async function projectMap(tx: Tx, projectId: string): Promise<ProjectMap | null> {
  const [[project], nodes, links] = await Promise.all([
    rows<{ id: string; name: string; location: string }>(tx, sql`select id, name, location from projects where id = ${projectId}`),
    rows<{ company_id: string; name: string; tmc_id: string; tier: number; role_label: string | null; published: boolean | null; score: number | null; band: string | null; light: string | null; payers: number }>(
      tx,
      sql`select m.company_id, c.legal_name as name, c.tmc_id, m.tier, m.role_label, sc.published, sc.score, sc.band, sc.light,
            (select count(*) from project_links k where k.project_id = m.project_id and k.payee_company_id = m.company_id)::int as payers
          from project_members m join companies c on c.id = m.company_id
          left join ${LATEST_SCORES} sc on sc.company_id = m.company_id
          where m.project_id = ${projectId} order by m.tier, c.legal_name`,
    ),
    rows<{ payer: string; payee: string }>(
      tx,
      sql`select payer_company_id as payer, payee_company_id as payee from project_links where project_id = ${projectId}`,
    ),
  ]);
  if (!project) return null;
  return {
    ...project,
    nodes: nodes.map((n) => ({
      companyId: n.company_id,
      name: n.name,
      tmcId: n.tmc_id,
      tier: n.tier as 0 | 1 | 2 | 3,
      roleLabel: n.role_label,
      score: badge(n),
      shared: n.payers >= 2,
    })),
    links,
  };
}
