/** Score visuals from the website (gauge, band chip, traffic light, payment bars, factor bars) — pure, no hooks.
 *  Each takes a Translator so it renders in server components (getT) and client components (useT). */
import type { Band, Behaviour, Light } from "@tmc/domain";
import { PRIVACY_FLOOR } from "@tmc/domain";
import type { ScoreBadge as ScoreBadgeT, ScoreCard } from "@/server/contracts";
import type { Translator } from "@/i18n/core";
import { companyName, formatPercent, formatPeriod, formatPeriodShort } from "../format";
import { AlertBox, LockIcon } from "../ui/Basics";

const MIN = 300;
const MAX = 1000;

export const bandTone = (b: Band | null | undefined) => (b === "EXCELLENT" || b === "GOOD" ? "ok" : b === "FAIR" ? "warn" : b === "POOR" ? "bad" : "neutral");
const toneVar = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", neutral: "var(--line-strong)" } as const;

export function BandChip({ band, score, t }: { band: Band; score?: number | null; t: Translator }) {
  return <span className={`band-chip c-${bandTone(band)}`}>{score != null ? `${score} · ` : ""}{t(`band.${band}`)}</span>;
}

export function TrafficLight({ light, t, small = false, withText = false }: { light: Light | null; t: Translator; small?: boolean; withText?: boolean }) {
  const label = light ? t(`lightText.${light}`) : t("light.none");
  return (
    <span className="light-row">
      <span className={`light ${small ? "sm" : ""}`} data-l={light ?? "NONE"} role="img" aria-label={label}><i /><i /><i /></span>
      {withText && <span>{label}</span>}
    </span>
  );
}

const pbLevel: Record<Behaviour, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
export function PaymentBars({ behaviour, t }: { behaviour: Behaviour; t: Translator }) {
  return (
    <span className="light-row">
      <span className="pb" data-p={pbLevel[behaviour]} aria-hidden="true"><i /><i /><i /></span>
      <span>{t(`behaviour.${behaviour}`)}</span>
    </span>
  );
}

/** The website's SVG semicircle gauge, scaled 300–1000. */
export function ScoreGauge({ score, band, t, small = false, caption }: { score: number | null; band: Band | null; t: Translator; small?: boolean; caption?: string }) {
  const frac = score == null ? 0 : Math.max(0, Math.min(1, (score - MIN) / (MAX - MIN)));
  const tone = bandTone(band);
  return (
    <div className={`gauge ${small ? "sm" : ""}`}>
      <svg viewBox="0 0 240 140" role="img" aria-label={score == null ? t("light.none") : `${t("score.title")}: ${score} ${t("score.outOf")}${band ? `, ${t(`band.${band}`)}` : ""}`}>
        <path className="g-bg" d="M20 120 A100 100 0 0 1 220 120" fill="none" strokeWidth="18" pathLength={1000} />
        <path className="g-val" d="M20 120 A100 100 0 0 1 220 120" fill="none" strokeWidth="18" pathLength={1000} strokeDasharray={`${Math.round(frac * 1000)} 1000`} style={{ stroke: toneVar[tone] }} />
        <g className="g-tick" strokeWidth="1.5">
          <line x1="2" y1="120" x2="8" y2="120" /><line x1="36.6" y1="36.6" x2="40.8" y2="40.8" /><line x1="120" y1="2" x2="120" y2="8" />
          <line x1="203.4" y1="36.6" x2="199.2" y2="40.8" /><line x1="238" y1="120" x2="232" y2="120" />
        </g>
        <text x="20" y="138" textAnchor="middle">{MIN}</text>
        <text x="220" y="138" textAnchor="middle">{MAX}</text>
        {score == null ? <text className="g-empty" x="120" y="110" textAnchor="middle">—</text> : <text className="g-score" x="120" y="112" textAnchor="middle">{score}</text>}
      </svg>
      {band && <BandChip band={band} t={t} />}
      {caption && <span className="small muted">{caption}</span>}
    </div>
  );
}

const factorTone = (v: number) => (v >= 80 ? "v-ok" : v >= 60 ? "v-warn" : "v-bad");

export function FactorBars({ card, t }: { card: ScoreCard; t: Translator }) {
  const minCap = card.caps.length ? Math.min(...card.caps.map((c) => c.cap)) : null;
  return (
    <div className="comp">
      {card.factors.map((f) => (
        <div className="comp-row" key={f.key}>
          <span className="lbl">{t(`factor.${f.key}`)}<small>{t("score.weight", { w: formatPercent(f.weight, t.locale) })}</small></span>
          <span className="tk" aria-hidden="true"><i className={factorTone(f.value)} style={{ width: `${Math.round(f.value)}%` }} /></span>
          <span className="n">{Math.round(f.value)}</span>
          <span className="why">{t.dyn(f.reason.key, f.reason.params)}</span>
        </div>
      ))}
      <div className="comp-row">
        <span className="lbl">{t("score.badDebt")}<small>{t("score.badDebtHint")}</small></span>
        <span className="tk" aria-hidden="true"><i className={minCap == null ? "v-ok" : "v-bad"} style={{ width: minCap == null ? "100%" : "18%" }} /></span>
        <span className="n">{minCap == null ? "✓" : minCap}</span>
        <span className="why">{minCap == null ? t("score.badDebtNone") : card.caps.map((c) => `${t.dyn(c.key)} — ${t("score.cappedAt", { cap: c.cap })}`).join(" · ")}</span>
      </div>
    </div>
  );
}

export function Sparkline({ points, t, label }: { points: { period: string; score: number }[]; t: Translator; label: string }) {
  if (points.length < 2) return null;
  const W = 300, H = 80, P = 6;
  const xs = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1);
  const ys = (s: number) => H - 16 - ((s - MIN) / (MAX - MIN)) * (H - 26);
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.score).toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${points.map((p) => `${formatPeriodShort(p.period, t.locale)} ${p.score}`).join(", ")}`}>
      <line className="grid" x1={P} x2={W - P} y1={ys(600)} y2={ys(600)} />
      <line className="grid" x1={P} x2={W - P} y1={ys(800)} y2={ys(800)} />
      <path className="ar" d={`${d} L${xs(points.length - 1)} ${H - 16} L${xs(0)} ${H - 16} Z`} />
      <path className="ln" d={d} />
      {points.map((p, i) => <circle key={p.period} className={i === points.length - 1 ? "last" : "pt"} cx={xs(i)} cy={ys(p.score)} r={i === points.length - 1 ? 4.5 : 2.5} />)}
      <text x={xs(0)} y={H - 2} textAnchor="start">{formatPeriodShort(first.period, t.locale)}</text>
      <text x={xs(points.length - 1)} y={H - 2} textAnchor="end">{formatPeriodShort(last.period, t.locale)} · {last.score}</text>
    </svg>
  );
}

/** Small inline badge for tables / map: score + band chip + light. */
export function ScoreBadge({ badge, t }: { badge: ScoreBadgeT | null; t: Translator }) {
  if (!badge) return <span className="small muted">{t("light.none")}</span>;
  return (
    <span className="light-row">
      <TrafficLight light={badge.light} t={t} small />
      <BandChip band={badge.band} score={badge.score} t={t} />
    </span>
  );
}

/** The privacy floor empty state — friendly, explains why nothing is shown. */
export function FloorState({ card, t, own = false }: { card: ScoreCard; t: Translator; own?: boolean }) {
  const noPayment = card.suppressedReason === "NO_PAYMENT_DATA";
  const never = !card.releasePeriod && !card.suppressedReason;
  const title = never ? t("score.neverTitle") : noPayment ? t("score.noPaymentTitle") : t("score.suppressedTitle");
  const body = never ? t("score.neverBody") : noPayment ? t("score.noPaymentBody") : own ? t("score.suppressedOwn") : t("score.suppressedBody");
  return (
    <div className="floor">
      <div className="dots" role="img" aria-label={t("score.floorRule")}>
        {Array.from({ length: PRIVACY_FLOOR }, (_, i) => <i key={i} className={noPayment && i < PRIVACY_FLOOR ? "on" : ""} />)}
      </div>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
        {!noPayment && !never && <p className="small" style={{ marginTop: 8 }}><b>{t("score.floorRule")}</b></p>}
      </div>
    </div>
  );
}

/** Full score card: gauge, band, light, behaviour, exposure + supplier band, confidence, factors with reasons, caps, frozen note, history, alert. */
export function ScoreCardView({ card, t, own = false, compact = false }: { card: ScoreCard; t: Translator; own?: boolean; compact?: boolean }) {
  const shown = card.published && card.score != null && !card.suppressedReason;
  return (
    <div className="stack-lg">
      {!compact && (
        <div className="co-head">
          <span className="co-mark" aria-hidden="true">{companyName(card.company, t.locale).charAt(0)}</span>
          <div className="nm">
            <h2>{companyName(card.company, t.locale)}</h2>
            <small><span className="ltr mono">{card.company.tmcId}</span><span>{card.company.city}</span><span>{t.has(`sector.${card.company.sector}`) ? t.dyn(`sector.${card.company.sector}`) : card.company.sector}</span></small>
          </div>
        </div>
      )}
      {!shown ? <FloorState card={card} t={t} own={own} /> : (
        <div className={compact ? "scorecard compact" : "scorecard"}>
          <div className="left">
            <ScoreGauge score={card.score} band={card.band} t={t} caption={card.releasePeriod ? t("score.release", { period: formatPeriod(card.releasePeriod, t.locale) }) : undefined} />
            {card.frozen && <p className="frozen">{t("score.frozen")}</p>}
            {card.history.length > 1 && (
              <div className="history"><p className="pk" style={{ marginBottom: 6 }}>{t("score.history")}</p><Sparkline points={card.history} t={t} label={t("score.history")} /></div>
            )}
          </div>
          <div className="right">
            <dl className="signals">
              <div className="sig"><dt>{t("score.light")}</dt><dd><TrafficLight light={card.light} t={t} withText /></dd></div>
              {card.exposureBand && <div className="sig"><dt>{t("score.exposure")}</dt><dd>{t("score.exposureValue", { range: card.exposureBand, suppliers: card.supplierBand ?? "—" })}</dd></div>}
              {card.behaviour && <div className="sig"><dt>{t("score.behaviour")}</dt><dd><PaymentBars behaviour={card.behaviour} t={t} /></dd></div>}
              {card.confidence && <div className="sig"><dt>{t("score.confidence")}</dt><dd>{t(`confidence.${card.confidence}`)} <span className="small muted">· {t(`confidenceHint.${card.confidence}`)}</span></dd></div>}
            </dl>
            {card.activeAlert ? <AlertBox tone="on" title={t("score.alertTitle")}>{t("score.alertOn")}</AlertBox>
              : <AlertBox tone="off" title={t("score.alertTitle")}>{t("score.alertOff")}</AlertBox>}
            {!compact && (
              <div className="stack">
                <div><h3>{t("score.why")}</h3><p className="small muted">{t("score.factorsSub")}</p></div>
                <FactorBars card={card} t={t} />
              </div>
            )}
          </div>
        </div>
      )}
      {!own && <p className="privacy-line"><LockIcon /><span>{t("common.privacyLine")}</span></p>}
    </div>
  );
}
