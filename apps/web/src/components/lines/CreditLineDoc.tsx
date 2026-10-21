/** The website's `.doc` credit-line card, with real data. Pure (takes a Translator). */
import type { ReactNode } from "react";
import type { TermsDays } from "@tmc/domain";
import type { CompanyRef, ScoreBadge } from "@/server/contracts";
import type { Translator } from "@/i18n/core";
import { companyName, formatDate, formatMoney } from "../format";
import { bandTone } from "../score/Score";

export type DocStamp = "verified" | "pending" | "declined" | "preview";

export function CreditLineDoc({ t, tclId, supplier, buyer, limitHalalas, termsDays, effectiveDate, version, stamp, attestation, buyerScore, tag, footer, animate = true, ticks }: {
  t: Translator; tclId: string | null; supplier: CompanyRef & { city?: string }; buyer: CompanyRef & { city?: string };
  limitHalalas: number; termsDays: TermsDays; effectiveDate: string; version?: number; stamp: DocStamp; attestation?: string | null;
  buyerScore?: ScoreBadge | null; tag?: ReactNode; footer?: ReactNode; animate?: boolean; ticks?: [boolean, boolean, boolean];
}) {
  const done = ticks ?? (stamp === "verified" ? [true, true, true] : [true, false, false]);
  const stampText = { verified: t("doc.stampVerified"), pending: t("doc.stampPending"), declined: t("doc.stampDeclined"), preview: t("doc.stampPreview") }[stamp];
  const stampTone = stamp === "verified" ? "" : stamp === "declined" ? "bad" : "warn";
  return (
    <article className={`doc ${animate ? "animate" : ""}`} aria-label={t("doc.title")}>
      <div className="doc-top"><small>{t("doc.title")}</small>{tag}</div>
      <p className="doc-id">{t("doc.lineId")} · <code>{tclId ?? "TCL-SA-•••••••"}</code>{version ? <span>· {t("doc.version")} {version}</span> : null}</p>
      <div className="doc-body">
        <div className="dparties">
          <div className="dparty"><span className="dlabel">{t("doc.supplier")}</span><strong>{companyName(supplier, t.locale)}</strong><code className="ltr">{supplier.tmcId}</code></div>
          <div className="darrow" aria-hidden="true">{t("doc.credit")}<i />{t("common.net", { n: termsDays })}</div>
          <div className="dparty r"><span className="dlabel">{t("doc.buyer")}</span><strong>{companyName(buyer, t.locale)}</strong><code className="ltr">{buyer.tmcId}</code></div>
        </div>
        <div className="damount"><span className="dlabel">{t("doc.limit")}</span><b className="num">{formatMoney(limitHalalas, t.locale)}</b></div>
        <div className="dterms">
          <div><span className="dlabel">{t("doc.terms")}</span><b>{t("common.net", { n: termsDays })}</b></div>
          <div><span className="dlabel">{t("doc.effective")}</span><b>{formatDate(effectiveDate, t.locale)}</b></div>
          {version ? <div><span className="dlabel">{t("doc.version")}</span><b>{version}</b></div> : null}
        </div>
        {attestation && <p className="doc-attest"><span className="dlabel">{t("doc.attestation")}</span><br />{attestation}</p>}
        <ol className="ticks">
          {[t("doc.tick1"), t("doc.tick2"), t("doc.tick3")].map((txt, i) => (
            <li key={i}><span className={`tick ${done[i] ? "" : "pending"}`} aria-hidden="true">{done[i] ? "✓" : ""}</span>{txt}</li>
          ))}
        </ol>
        <span className={`stamp ${stampTone}`}>{stampText}</span>
      </div>
      {(footer || buyerScore) && (
        <div className="doc-foot">
          {footer ?? (buyerScore && <><span>{t("doc.buyerScore")}</span><span className={`band-chip c-${bandTone(buyerScore.band)}`}>{buyerScore.score} · {t(`band.${buyerScore.band}`)}</span></>)}
        </div>
      )}
    </article>
  );
}
