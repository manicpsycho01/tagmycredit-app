/** Monthly score release (SPEC §5) and the privacy-floor check used for network alerts. */
import {
  addPeriods,
  cohortHash,
  eligibleSupplierIds,
  isPeriod,
  latestCompletedPeriod,
  LOOKBACK_PERIODS,
  meetsPrivacyFloor,
  periodIndex,
  reportingPeriod,
  scoreBuyer,
  type LineStatus,
  type ScoreDefault,
  type ScoreLine,
  type ScoreValues,
} from "@tmc/domain";
import { sql } from "drizzle-orm";
import { buyerScores, scoreReleases } from "../schema";
import { audit, type Executor } from "./audit";
import { hrefs, notify } from "./notify";
import { num, rows } from "./sql";

interface LineRow {
  id: string;
  buyer_company_id: string;
  supplier_company_id: string;
  status: LineStatus;
  suspended: boolean;
  closed_at: Date | null;
  limit_halalas: string;
}
interface SnapRow {
  line_id: string;
  period: string;
  outstanding: string;
  not_due: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  settled_total: string;
  settled_on_time: string;
}

/** Score inputs per buyer: ACTIVE/CLOSED lines with their usable snapshots in the 12-month lookback. */
export async function loadScoreLines(ex: Executor, period: string, buyerId?: string): Promise<Map<string, ScoreLine[]>> {
  const from = addPeriods(period, -(LOOKBACK_PERIODS - 1));
  const buyerFilter = buyerId ? sql`and l.buyer_company_id = ${buyerId}` : sql``;
  const [lines, snaps] = await Promise.all([
    rows<LineRow>(
      ex,
      sql`select l.id, l.buyer_company_id, l.supplier_company_id, l.status, l.suspended, l.closed_at, v.limit_halalas
          from credit_lines l join credit_line_versions v on v.line_id = l.id and v.version = l.current_version
          where l.status in ('ACTIVE', 'CLOSED') ${buyerFilter}`,
    ),
    rows<SnapRow>(
      ex,
      sql`select s.line_id, s.period::text, s.outstanding, s.not_due, s.d1_30, s.d31_60, s.d61_90, s.d90_plus, s.settled_total, s.settled_on_time
          from snapshots s join credit_lines l on l.id = s.line_id
          where l.status in ('ACTIVE', 'CLOSED') ${buyerFilter}
            and s.period between ${from} and ${period} and not s.quarantined and not s.rejected`,
    ),
  ]);
  const byLine = new Map<string, ScoreLine["snapshots"]>();
  for (const s of snaps) {
    const list = byLine.get(s.line_id) ?? [];
    list.push({
      period: s.period,
      outstanding: num(s.outstanding),
      notDue: num(s.not_due),
      d1_30: num(s.d1_30),
      d31_60: num(s.d31_60),
      d61_90: num(s.d61_90),
      d90Plus: num(s.d90_plus),
      settledTotal: num(s.settled_total),
      settledOnTime: num(s.settled_on_time),
    });
    byLine.set(s.line_id, list);
  }
  const byBuyer = new Map<string, ScoreLine[]>();
  for (const l of lines) {
    const list = byBuyer.get(l.buyer_company_id) ?? [];
    list.push({
      supplierId: l.supplier_company_id,
      status: l.status,
      suspended: l.suspended,
      closedAt: l.closed_at ? new Date(l.closed_at) : null,
      confirmedLimit: num(l.limit_halalas),
      snapshots: byLine.get(l.id) ?? [],
    });
    byBuyer.set(l.buyer_company_id, list);
  }
  return byBuyer;
}

/** Whether a buyer meets the 3-supplier floor on current data (network alerts, SPEC §6). */
export async function buyerMeetsFloorNow(ex: Executor, buyerId: string, now: Date): Promise<boolean> {
  const period = reportingPeriod(now);
  const lines = (await loadScoreLines(ex, period, buyerId)).get(buyerId) ?? [];
  return meetsPrivacyFloor(eligibleSupplierIds(lines, period).length);
}

export interface ReleaseSummary {
  id: string;
  period: string;
  runAt: Date;
  companiesScored: number;
  companiesSuppressed: number;
}

export type ReleaseResult = { ok: true; release: ReleaseSummary } | { ok: false; error: string };

/**
 * Score every company that is a buyer on any line for `period` and publish the release.
 * Periods must be completed months and later than the last release.
 */
export async function runRelease(ex: Executor, opts: { period: string; now: Date; runBy: string | null }): Promise<ReleaseResult> {
  const { period, now, runBy } = opts;
  if (!isPeriod(period) || periodIndex(period) > periodIndex(latestCompletedPeriod(now))) return { ok: false, error: "errors.releasePeriodInvalid" };
  const [last] = await rows<{ period: string }>(ex, sql`select max(period)::text as period from score_releases`);
  if (last?.period && periodIndex(last.period) >= periodIndex(period)) return { ok: false, error: "errors.releaseExists" };

  const asOf = sql`${addPeriods(period, 1)}::date`;
  const [linesByBuyer, buyers, defaults, previous] = await Promise.all([
    loadScoreLines(ex, period),
    rows<{ id: string }>(ex, sql`select distinct buyer_company_id as id from credit_lines`),
    rows<{ buyer_company_id: string; decided_at: Date; status: string }>(
      ex,
      sql`select l.buyer_company_id, r.decided_at, r.status from default_reports r join credit_lines l on l.id = r.line_id
          where r.status in ('UPHELD', 'SETTLED') and l.status <> 'VOIDED' and r.decided_at < ${asOf}`,
    ),
    rows<{ company_id: string; published: boolean; cohort_hash: string | null; score: number | null; band: string | null; light: string | null; behaviour: string | null; confidence: string | null; exposure_band: string | null; supplier_band: string | null; explanation: ScoreValues["explanation"] | null }>(
      ex,
      sql`select distinct on (b.company_id) b.company_id, b.published, b.cohort_hash, b.score, b.band, b.light, b.behaviour,
            b.confidence, b.exposure_band, b.supplier_band, b.explanation
          from buyer_scores b join score_releases r on r.id = b.release_id
          where r.period < ${period} order by b.company_id, r.period desc`,
    ),
  ]);
  const defaultsByBuyer = new Map<string, ScoreDefault[]>();
  for (const d of defaults) {
    const list = defaultsByBuyer.get(d.buyer_company_id) ?? [];
    list.push({ upheldAt: new Date(d.decided_at), settled: d.status === "SETTLED" });
    defaultsByBuyer.set(d.buyer_company_id, list);
  }
  const prevByCompany = new Map(previous.map((p) => [p.company_id, p]));

  const outcomes = await Promise.all(
    buyers.map(async ({ id }) => {
      const lines = linesByBuyer.get(id) ?? [];
      const hash = await cohortHash(eligibleSupplierIds(lines, period));
      const prev = prevByCompany.get(id);
      const outcome = scoreBuyer({
        period,
        lines,
        defaults: defaultsByBuyer.get(id) ?? [],
        cohortHash: hash,
        previous: prev
          ? {
              published: prev.published,
              cohortHash: prev.cohort_hash,
              values:
                prev.published && prev.score !== null && prev.explanation
                  ? ({
                      score: prev.score,
                      band: prev.band,
                      light: prev.light,
                      behaviour: prev.behaviour,
                      confidence: prev.confidence,
                      exposureBand: prev.exposure_band,
                      supplierBand: prev.supplier_band,
                      explanation: prev.explanation,
                    } as ScoreValues)
                  : null,
            }
          : null,
      });
      return { id, hash, outcome };
    }),
  );

  const scored = outcomes.filter((o) => o.outcome.published).length;
  const [release] = await ex
    .insert(scoreReleases)
    .values({ period, runAt: now, runBy, companiesScored: scored, companiesSuppressed: outcomes.length - scored })
    .onConflictDoNothing({ target: scoreReleases.period })
    .returning();
  if (!release) return { ok: false, error: "errors.releaseExists" };

  if (outcomes.length) {
    await ex.insert(buyerScores).values(
      outcomes.map(({ id, hash, outcome }) => {
        const v = outcome.published ? outcome.values : null;
        return {
          releaseId: release.id,
          companyId: id,
          published: outcome.published,
          suppressedReason: outcome.published ? null : outcome.suppressedReason,
          frozen: outcome.published && outcome.frozen,
          score: v?.score ?? null,
          band: v?.band ?? null,
          light: v?.light ?? null,
          behaviour: v?.behaviour ?? null,
          confidence: v?.confidence ?? null,
          exposureBand: v?.exposureBand ?? null,
          supplierBand: v?.supplierBand ?? null,
          explanation: v?.explanation ?? null,
          cohortHash: hash,
          createdAt: now,
        };
      }),
    );
    await notify(
      ex,
      outcomes.map(({ id, outcome }) => ({
        companyId: id,
        kind: "SCORE_RELEASED" as const,
        params: { period, published: outcome.published ? 1 : 0 },
        href: hrefs.check(id),
      })),
    );
  }
  await audit(ex, { actor: runBy, companyId: null, entityType: "score_release", entityId: release.id, action: "release.run", data: { period, scored, suppressed: outcomes.length - scored } });
  return {
    ok: true,
    release: { id: release.id, period: release.period, runAt: release.runAt, companiesScored: release.companiesScored, companiesSuppressed: release.companiesSuppressed },
  };
}
