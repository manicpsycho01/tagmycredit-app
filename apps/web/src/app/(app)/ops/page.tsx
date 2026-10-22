import Link from "next/link";
import { getOpsQueue, getSession, listReleases } from "@/server/queries";
import { getT } from "@/i18n/server";
import { DateText, EmptyState, PageHead, Panel } from "@/components/ui/Basics";
import { ResponsiveTable } from "@/components/mobile";
import { companyName, formatMoney, formatPeriod } from "@/components/format";
import { CaseButtons, DecideButtons, ReleaseButtons } from "./OpsClient";

const TABS = ["verification", "cfos", "disputes", "defaults", "quality", "release"] as const;
type Tab = (typeof TABS)[number];

export default async function OpsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [session, t, sp] = await Promise.all([getSession(), getT(), searchParams]);
  if (!session?.isStaff) return <EmptyState title={t("ops.staffOnly")} />;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "verification";
  const [q, releases] = await Promise.all([getOpsQueue(), tab === "release" ? listReleases() : Promise.resolve([])]);
  const label = { verification: t("ops.tabVerification"), cfos: t("ops.tabCfos"), disputes: t("ops.tabDisputes"), defaults: t("ops.tabDefaults"), quality: t("ops.tabQuality"), release: t("ops.tabRelease") };
  const count = { verification: q.companies.length, cfos: q.cfos.length, disputes: q.disputes.length, defaults: q.defaults.length, quality: q.snapshots.length, release: 0 };
  return (
    <div className="stack-lg">
      <PageHead title={t("ops.title")} sub={t("ops.sub")} actions={session.demoMode ? <Link className="btn btn-line" href="/dev/outbox">{t("nav.outbox")}</Link> : undefined} />
      <nav className="tabs" aria-label={t("ops.title")}>
        {TABS.map((k) => <Link key={k} href={`/ops?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{label[k]}{count[k] ? <span className="count">{count[k]}</span> : null}</Link>)}
      </nav>
      {tab === "verification" && (q.companies.length === 0 ? <EmptyState title={t("ops.emptyCompanies")} /> : (
        <div className="ops-list">{q.companies.map((c) => (
          <div className="ops-card" key={c.id}>
            <div className="row-between"><div className="stack" style={{ gap: 2 }}><b>{companyName(c, t.locale)}</b><span className="small muted ltr">{c.tmcId} · CR {c.crNumber}</span></div>
              <span className="small muted">{c.city} · {c.ownerEmail} · <DateText iso={c.createdAt} locale={t.locale} /></span></div>
            <DecideButtons kind="company" id={c.id} />
          </div>
        ))}</div>
      ))}
      {tab === "cfos" && (q.cfos.length === 0 ? <EmptyState title={t("ops.emptyCfos")} /> : (
        <div className="ops-list">{q.cfos.map((c) => (
          <div className="ops-card" key={c.id}>
            <div className="row-between"><div className="stack" style={{ gap: 2 }}><b>{c.name} · {c.title}</b><span className="small muted">{companyName(c.company, t.locale)} · {c.mobileMasked}</span></div>
              {c.authorityDoc && <a className="link small" href={c.authorityDoc.url} target="_blank" rel="noreferrer">{t("ops.authorityDoc")}: {c.authorityDoc.fileName}</a>}</div>
            <DecideButtons kind="cfo" id={c.id} />
          </div>
        ))}</div>
      ))}
      {tab === "disputes" && (q.disputes.length === 0 ? <EmptyState title={t("ops.emptyDisputes")} /> : (
        <div className="ops-list">{q.disputes.map((d) => (
          <div className="ops-card" key={d.id}>
            <div className="row-between"><b><Link className="link" href={`/lines/${d.line.id}`}>{d.line.tclId}</Link> · {t.dyn(`disputeStatus.${d.status}`)}</b>
              <span className="small muted">{companyName(d.buyer, t.locale)} · {t("ops.against", { name: companyName(d.supplier, t.locale) })} · <DateText iso={d.createdAt} locale={t.locale} /></span></div>
            <blockquote className="case" style={{ margin: 0 }}>{d.reason}</blockquote>
            {d.supplierResponse && <blockquote className="case" style={{ margin: 0 }}>{d.supplierResponse}</blockquote>}
            {d.attachments.map((a) => <a key={a.id} className="link small" href={a.url} target="_blank" rel="noreferrer">{a.fileName}</a>)}
            <CaseButtons kind="dispute" id={d.id} />
          </div>
        ))}</div>
      ))}
      {tab === "defaults" && (q.defaults.length === 0 ? <EmptyState title={t("ops.emptyDefaults")} /> : (
        <div className="ops-list">{q.defaults.map((r) => (
          <div className="ops-card" key={r.id}>
            <div className="row-between"><b><Link className="link" href={`/lines/${r.line.id}`}>{r.line.tclId}</Link> · {t.dyn(`defaultStatus.${r.status}`)}</b>
              <span className="small muted">{t("ops.filedBy", { name: companyName(r.supplier, t.locale) })} · {companyName(r.buyer, t.locale)} · {t("ops.amount")} {formatMoney(r.amountHalalas, t.locale)}</span></div>
            <blockquote className="case" style={{ margin: 0 }}>{r.note}</blockquote>
            {r.buyerReply && <blockquote className="case" style={{ margin: 0 }}>{r.buyerReply}</blockquote>}
            {r.attachments.map((a) => <a key={a.id} className="link small" href={a.url} target="_blank" rel="noreferrer">{a.fileName}</a>)}
            <CaseButtons kind={r.status === "UPHELD" ? "settled" : "default"} id={r.id} />
          </div>
        ))}</div>
      ))}
      {tab === "quality" && (q.snapshots.length === 0 ? <EmptyState title={t("ops.emptyQuality")} /> : (
        <div className="ops-list">{q.snapshots.map((s) => (
          <div className="ops-card" key={s.id}>
            <div className="row-between"><b><Link className="link" href={`/lines/${s.line.id}`}>{s.line.tclId}</Link> · {formatPeriod(s.period, t.locale)}</b>
              <span className="small muted">{companyName(s.supplier, t.locale)} → {companyName(s.buyer, t.locale)}</span></div>
            <span className="small">{t("line.colOutstanding")} {formatMoney(s.outstanding, t.locale)} · 90+ {formatMoney(s.d90Plus, t.locale)} · {t("line.limit")} {formatMoney(s.limitHalalas, t.locale)}
              {s.previous ? ` · ${t("ops.previous")} ${formatMoney(s.previous.outstanding, t.locale)}` : ""}</span>
            {s.supplierNote && <blockquote className="case" style={{ margin: 0 }}>{s.supplierNote}</blockquote>}
            <DecideButtons kind="snapshot" id={s.id} />
          </div>
        ))}</div>
      ))}
      {tab === "release" && (
        <>
          <Panel title={t("ops.releaseTitle")}><div className="release-hero"><p className="muted">{t("ops.releaseSub")}</p><ReleaseButtons /></div></Panel>
          <Panel title={t("ops.history")} flush>
            <ResponsiveTable caption={t("ops.history")} rows={releases} rowKey={(r) => r.id} empty={<p className="muted small" style={{ padding: 16 }}>{t("ops.emptyReleases")}</p>}
              columns={[
                { key: "p", header: t("ops.colPeriod"), primary: true, cell: (r) => formatPeriod(r.period, t.locale) },
                { key: "r", header: t("ops.colRunAt"), cell: (r) => <DateText iso={r.runAt} locale={t.locale} time /> },
                { key: "s", header: t("ops.colScored"), align: "end", cell: (r) => r.companiesScored },
                { key: "x", header: t("ops.colSuppressed"), align: "end", cell: (r) => r.companiesSuppressed },
              ]} />
          </Panel>
        </>
      )}
    </div>
  );
}
