import Link from "next/link";
import { notFound } from "next/navigation";
import { getLine, getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { DateText, Panel, PageHead, StatusPill, AlertBox, type Tone } from "@/components/ui/Basics";
import { ResponsiveTable } from "@/components/mobile";
import { LineFlags } from "@/components/lines/BookPage";
import { LineActions } from "@/components/lines/LineActions";
import { ScoreBadge } from "@/components/score/Score";
import { companyName, formatMoney, formatPeriod } from "@/components/format";

const vTone = (s: string): Tone => (s === "CONFIRMED" ? "ok" : s === "PENDING" ? "amber" : s === "DECLINED" ? "bad" : "neutral");

export default async function LinePage({ params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const [d, session, t] = await Promise.all([getLine(lineId), getSession(), getT()]);
  if (!d) notFound();
  const L = d.line;
  const now = new Date();
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const name = (c: { legalName: string; legalNameAr: string | null }) => companyName(c, t.locale);
  return (
    <div className="stack-lg">
      <PageHead title={t("line.title", { tclId: L.tclId })} crumbs={<Link href={L.side === "GIVEN" ? "/credit-given" : "/credit-received"}>{L.side === "GIVEN" ? t("nav.given") : t("nav.received")}</Link>}
        sub={<span className="line-parties"><b>{name(d.supplier)}</b><span className="arrow" aria-hidden="true">→</span><b>{name(d.buyer)}</b></span>} />
      <div className="row"><LineFlags l={L} t={t} />{L.counterpartyScore && <Link href={`/check/${L.counterparty.id}`}><ScoreBadge badge={L.counterpartyScore} t={t} /></Link>}</div>
      {L.suspended && <AlertBox tone="warn">{t("line.suspendedNote")}</AlertBox>}
      <Panel title={t("line.actions")}><LineActions d={d} snapshotPeriod={period} /></Panel>
      <div className="line-grid">
        <div className="stack-lg">
          <Panel>
            <dl className="kv">
              <div><dt>{t("line.limit")}</dt><dd className="num">{formatMoney(L.limitHalalas, t.locale)}</dd></div>
              <div><dt>{t("line.terms")}</dt><dd>{L.termsDays ? t("common.net", { n: L.termsDays }) : "—"}</dd></div>
              <div><dt>{t("line.outstanding")}</dt><dd className="num">{formatMoney(L.outstandingHalalas, t.locale)}</dd></div>
              <div><dt>{t("line.overdue")}</dt><dd className="num">{formatMoney(L.overdueHalalas, t.locale)}</dd></div>
              <div><dt>{t("line.created")}</dt><dd><DateText iso={L.createdAt} locale={t.locale} /></dd></div>
              <div><dt>{t("line.confirmed")}</dt><dd><DateText iso={L.confirmedAt} locale={t.locale} /></dd></div>
              {L.closedAt && <div><dt>{t("line.closed")}</dt><dd><DateText iso={L.closedAt} locale={t.locale} /> {L.closeReason ? `· ${L.closeReason}` : ""}</dd></div>}
              {L.voidReason && <div><dt>{t("line.voidReason")}</dt><dd>{L.voidReason}</dd></div>}
            </dl>
          </Panel>
          <Panel title={t("line.snapshots")} flush>
            <ResponsiveTable caption={t("line.snapshots")} rows={d.snapshots} rowKey={(s) => s.id}
              empty={<p className="muted small" style={{ padding: 16 }}>{t("line.noSnapshots")}</p>}
              columns={[
                { key: "p", header: t("line.colPeriod"), primary: true, cell: (s) => <span className="row" style={{ gap: 6 }}>{formatPeriod(s.period, t.locale)}{s.quarantined && <StatusPill tone="warn">{t("snap.held")}</StatusPill>}{s.rejected && <StatusPill tone="bad">{t("snap.rejected")}</StatusPill>}</span> },
                { key: "o", header: t("line.colOutstanding"), align: "end", cell: (s) => <span className="num">{formatMoney(s.outstanding, t.locale)}</span> },
                { key: "a", header: t("line.colAging"), cell: (s) => {
                  const tot = s.outstanding || 1;
                  return <span className="aging" role="img" aria-label={`${t("line.colNotDue")} ${formatMoney(s.notDue, t.locale)}, 90+ ${formatMoney(s.d90Plus, t.locale)}`}>
                    {[s.notDue, s.d1_30, s.d31_60, s.d61_90, s.d90Plus].map((v, i) => <i key={i} className={`a${i}`} style={{ width: `${(v / tot) * 100}%` }} />)}</span>;
                } },
                { key: "90", header: t("line.col90"), align: "end", cell: (s) => <span className="num">{formatMoney(s.d90Plus, t.locale)}</span> },
                { key: "ot", header: t("line.colOnTime"), align: "end", cell: (s) => (s.settledTotal ? `${Math.round((s.settledOnTime / s.settledTotal) * 100)}%` : "—") },
                { key: "n", header: t("common.note"), card: "full", cell: (s) => s.supplierNote ?? "" },
              ]} />
          </Panel>
        </div>
        <div className="stack-lg">
          <Panel title={t("line.versions")}>
            <ol className="timeline">
              {d.versions.map((v) => (
                <li key={v.id}>
                  <span className={`dot ${vTone(v.status) === "ok" ? "ok" : vTone(v.status) === "amber" ? "warn" : vTone(v.status) === "bad" ? "bad" : "muted"}`}>{v.version}</span>
                  <div className="body">
                    <div className="row-between"><b className="num">{formatMoney(v.limitHalalas, t.locale)} · {t("common.net", { n: v.termsDays })}</b><StatusPill tone={vTone(v.status)}>{t(`versionStatus.${v.status}`)}</StatusPill></div>
                    <span className="small muted">{t("line.effective", { date: "" })}<DateText iso={v.effectiveDate} locale={t.locale} /> · {t("line.proposed", { date: "" })}<DateText iso={v.proposedAt} locale={t.locale} /></span>
                    {v.declineReason && <span className="small">{t("line.declineReason", { reason: v.declineReason })}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          {[...d.disputes.map((x) => ({ k: "d" + x.id, title: t("line.disputes"), status: t(`disputeStatus.${x.status}`), tone: (x.status === "UPHELD" ? "bad" : x.status === "REJECTED" ? "neutral" : "warn") as Tone, at: x.createdAt, body: x.reason, reply: x.supplierResponse ? [t("line.supplierResponse"), x.supplierResponse] : null, note: x.decisionNote })),
            ...d.closures.map((x) => ({ k: "c" + x.id, title: t("line.closures"), status: t(`closureStatus.${x.status}`), tone: "neutral" as Tone, at: x.createdAt, body: x.reason, reply: x.objection ? [t("line.objection"), x.objection] : null, note: null })),
            ...d.defaults.map((x) => ({ k: "f" + x.id, title: `${t("line.defaults")} · ${formatMoney(x.amountHalalas, t.locale)}`, status: t(`defaultStatus.${x.status}`), tone: (x.status === "UPHELD" ? "bad" : "warn") as Tone, at: x.createdAt, body: x.note, reply: x.buyerReply ? [t("line.buyerReply"), x.buyerReply] : null, note: x.decisionNote })),
          ].map((c) => (
            <div className="case" key={c.k}>
              <div className="top"><b>{c.title}</b><StatusPill tone={c.tone}>{c.status}</StatusPill></div>
              <span className="small muted"><DateText iso={c.at} locale={t.locale} /></span>
              <p>{c.body}</p>
              {c.reply && <blockquote><small>{c.reply[0]}</small>{c.reply[1]}</blockquote>}
              {c.note && <blockquote><small>{t("line.decisionNote")}</small>{c.note}</blockquote>}
            </div>
          ))}
          {session?.isStaff && null}
        </div>
      </div>
    </div>
  );
}
