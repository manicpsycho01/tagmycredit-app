import Link from "next/link";
import type { LineStatus } from "@tmc/domain";
import type { LineSummary, Side } from "@/server/contracts";
import { listLines } from "@/server/queries";
import { getT } from "@/i18n/server";
import type { Translator } from "@/i18n/core";
import { ResponsiveTable, type RTColumn } from "../mobile";
import { EmptyState, PageHead, StatusPill, type Tone } from "../ui/Basics";
import { ScoreBadge } from "../score/Score";
import { companyName, formatMoney, formatPeriod } from "../format";

export const lineTone = (s: LineStatus): Tone => (s === "ACTIVE" ? "ok" : s === "PENDING" ? "amber" : s === "DECLINED" || s === "VOIDED" ? "bad" : "neutral");
const STATUSES: (LineStatus | "ALL")[] = ["ALL", "ACTIVE", "PENDING", "CLOSED", "DECLINED", "EXPIRED", "VOIDED"];

export function LineFlags({ l, t }: { l: LineSummary; t: Translator }) {
  return (
    <span className="flags">
      <StatusPill tone={lineTone(l.status)}>{t(`lineStatus.${l.status}`)}</StatusPill>
      {l.suspended && <StatusPill tone="bad">{t("lineFlag.suspended")}</StatusPill>}
      {l.hasPendingVersion && l.status !== "PENDING" && <StatusPill tone="amber">{t("lineFlag.pendingVersion")}</StatusPill>}
      {l.openDispute && <StatusPill tone="warn">{t("lineFlag.dispute")}</StatusPill>}
      {l.openClosure && <StatusPill tone="warn">{t("lineFlag.closure")}</StatusPill>}
      {l.openDefault && <StatusPill tone="bad">{t("lineFlag.default")}</StatusPill>}
    </span>
  );
}

export async function BookPage({ side, searchParams }: { side: Side; searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = (STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as LineStatus | "ALL") : "ALL";
  const q = sp.q?.trim() || undefined;
  const [lines, t] = await Promise.all([listLines(side, { status, q }), getT()]);
  const given = side === "GIVEN";
  const base = given ? "/credit-given" : "/credit-received";
  const cols: RTColumn<LineSummary>[] = [
    { key: "cp", header: given ? t("books.colCounterpartyGiven") : t("books.colCounterpartyReceived"), primary: true,
      cell: (l) => <span className="primary"><span>{companyName(l.counterparty, t.locale)}</span><small className="ltr">{l.tclId}</small></span> },
    { key: "st", header: t("books.colStatus"), cell: (l) => <LineFlags l={l} t={t} />, card: "full" },
    { key: "lim", header: t("books.colLimit"), align: "end", cell: (l) => <span className="num">{formatMoney(l.limitHalalas, t.locale)}</span> },
    { key: "terms", header: t("books.colTerms"), cell: (l) => (l.termsDays ? t("common.net", { n: l.termsDays }) : "—") },
    { key: "out", header: t("books.colOutstanding"), align: "end", cell: (l) => <span className="num">{formatMoney(l.outstandingHalalas, t.locale)}</span> },
    { key: "od", header: t("books.colOverdue"), align: "end", cell: (l) => <span className="num" style={l.overdueHalalas ? { color: "var(--bad)" } : undefined}>{formatMoney(l.overdueHalalas, t.locale)}</span> },
    ...(given ? [{ key: "sc", header: t("books.colScore"), cell: (l: LineSummary) => <ScoreBadge badge={l.counterpartyScore} t={t} />, card: "full" as const }] : []),
    { key: "lp", header: t("books.colLatest"), cell: (l) => formatPeriod(l.latestPeriod, t.locale), card: "hide" },
  ];
  return (
    <>
      <PageHead title={given ? t("books.givenTitle") : t("books.receivedTitle")} sub={given ? t("books.givenSub") : t("books.receivedSub")}
        actions={given ? <Link className="btn btn-amber" href="/lines/new">{t("home.tagLine")}</Link> : undefined} />
      <form className="filters" role="search">
        <input className="input search" type="search" name="q" defaultValue={q} placeholder={t("books.searchPlaceholder")} aria-label={t("common.search")} />
        <select className="select" style={{ width: "auto" }} name="status" defaultValue={status} aria-label={t("books.filterStatus")}>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`lineStatus.${s}`)}</option>)}
        </select>
        <button className="btn btn-line" type="submit">{t("common.search")}</button>
      </form>
      <ResponsiveTable caption={given ? t("books.givenTitle") : t("books.receivedTitle")} columns={cols} rows={lines} rowKey={(l) => l.id} rowHref={(l) => `/lines/${l.id}`}
        empty={q || status !== "ALL"
          ? <EmptyState title={t("books.noMatch")} actions={<Link className="btn btn-line" href={base}>{t("books.clearFilters")}</Link>} />
          : <EmptyState title={given ? t("books.emptyGivenTitle") : t("books.emptyReceivedTitle")} body={given ? t("books.emptyGivenBody") : t("books.emptyReceivedBody")}
              actions={given ? <Link className="btn btn-amber" href="/lines/new">{t("home.tagLine")}</Link> : undefined} />} />
    </>
  );
}
