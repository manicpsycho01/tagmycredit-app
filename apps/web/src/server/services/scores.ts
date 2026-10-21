import "server-only";
import { rows } from "@tmc/db/jobs";
import type { Tx } from "@tmc/db";
import type { Band, Behaviour, Confidence, Light, ScoreExplanation, SuppressedReason } from "@tmc/domain";
import { sql } from "drizzle-orm";
import type { ScoreBadge, ScoreCard } from "../contracts";

/** Each company's row in its most recent release (published or not). Columns readable by tmc_app. */
export const LATEST_SCORES = sql`(
  select distinct on (b.company_id) b.company_id, b.published, b.score, b.band, b.light
  from buyer_scores b join score_releases r on r.id = b.release_id
  order by b.company_id, r.period desc
)`;

export function badge(row: { published: boolean | null; score: number | null; band: string | null; light: string | null }): ScoreBadge | null {
  return row.published && row.score !== null ? { score: row.score, band: row.band as Band, light: row.light as Light } : null;
}

interface CardRow {
  id: string;
  tmc_id: string;
  legal_name: string;
  legal_name_ar: string | null;
  city: string;
  sector: string;
  status: string;
  period: string | null;
  published: boolean | null;
  suppressed_reason: SuppressedReason | null;
  frozen: boolean | null;
  score: number | null;
  band: Band | null;
  light: Light | null;
  behaviour: Behaviour | null;
  confidence: Confidence | null;
  exposure_band: string | null;
  supplier_band: string | null;
  explanation: ScoreExplanation | null;
  history: { period: string; score: number }[] | null;
}

/** Score card of a company (directory fields via SECURITY DEFINER `company_directory`, scores via RLS). */
export async function scoreCard(tx: Tx, companyId: string): Promise<(ScoreCard & { status: string }) | null> {
  const [r] = await rows<CardRow>(
    tx,
    sql`select c.id, c.tmc_id, c.legal_name, c.legal_name_ar, c.city, c.sector, c.status,
          s.period, s.published, s.suppressed_reason, s.frozen, s.score, s.band, s.light, s.behaviour, s.confidence,
          s.exposure_band, s.supplier_band, s.explanation,
          (select json_agg(json_build_object('period', h.period, 'score', h.score) order by h.period)
             from (select r.period::text as period, b.score from buyer_scores b join score_releases r on r.id = b.release_id
                   where b.company_id = c.id and b.published order by r.period desc limit 12) h) as history
        from company_directory(${companyId}::uuid) c
        left join lateral (
          select r.period::text as period, b.published, b.suppressed_reason, b.frozen, b.score, b.band, b.light, b.behaviour,
            b.confidence, b.exposure_band, b.supplier_band, b.explanation
          from buyer_scores b join score_releases r on r.id = b.release_id
          where b.company_id = c.id order by r.period desc limit 1
        ) s on true`,
  );
  if (!r) return null;
  const published = r.published === true;
  const ex = published ? r.explanation : null;
  return {
    status: r.status,
    company: { id: r.id, tmcId: r.tmc_id, legalName: r.legal_name, legalNameAr: r.legal_name_ar, city: r.city, sector: r.sector },
    releasePeriod: r.period,
    published,
    suppressedReason: published ? null : r.suppressed_reason,
    frozen: published && r.frozen === true,
    score: published ? r.score : null,
    band: published ? r.band : null,
    light: published ? r.light : null,
    behaviour: published ? r.behaviour : null,
    confidence: published ? r.confidence : null,
    exposureBand: published ? r.exposure_band : null,
    supplierBand: published ? r.supplier_band : null,
    factors: ex?.factors ?? [],
    caps: ex?.caps ?? [],
    defaultsReason: ex?.defaultsReason ?? null,
    activeAlert: ex?.activeAlert ?? false,
    history: published ? (r.history ?? []) : [],
  };
}

