import Link from "next/link";
import { getSnapshotWorklist } from "@/server/queries";
import { getT } from "@/i18n/server";
import { ResponsiveTable, type RTColumn } from "@/components/mobile";
import { EmptyState, PageHead, StatusPill } from "@/components/ui/Basics";
import { companyName, formatDate, formatMoney, formatPeriod } from "@/components/format";
import type { LineSummary } from "@/server/contracts";

type Row = LineSummary & { submitted: boolean };

/** Monthly reporting worklist: each active line given, with this period's status. The form lives on the line page. */
export default async function SnapshotsPage() {
  const [w, t] = await Promise.all([getSnapshotWorklist(), getT()]);
  const done = w.lines.filter((l) => l.submitted).length;
  const cols: RTColumn<Row>[] = [
    { key: "cp", header: t("books.colCounterpartyGiven"), primary: true,
      cell: (l) => <span className="primary"><Link href={`/lines/${l.id}`}>{companyName(l.counterparty, t.locale)}</Link><small className="ltr">{l.tclId}</small></span> },
    { key: "st", header: t("books.colStatus"),
      cell: (l) => (l.submitted ? <StatusPill tone="ok">{t("snap.submitted")}</StatusPill> : <StatusPill tone="amber">{t("snap.due")}</StatusPill>) },
    { key: "out", header: t("snap.outstanding"), align: "end", cell: (l) => <span className="num">{formatMoney(l.outstandingHalalas, t.locale)}</span> },
    { key: "go", header: "", align: "end",
      cell: (l) => <Link className="btn btn-line" href={`/lines/${l.id}`}>{l.submitted ? t("snap.resubmit") : t("snap.submit")}</Link> },
  ];
  return (
    <>
      <PageHead
        title={t("snap.title")}
        sub={t("snap.sub", { period: formatPeriod(w.period, t.locale), dueDate: formatDate(w.dueDate, t.locale) })}
        actions={w.lines.length ? <StatusPill tone={done === w.lines.length ? "ok" : "amber"}>{t("snap.progress", { done, total: w.lines.length })}</StatusPill> : undefined}
      />
      {w.lines.length === 0 ? (
        <EmptyState title={t("snap.emptyTitle")} body={t("snap.emptyBody")} />
      ) : (
        <>
          {done === w.lines.length && <EmptyState title={t("snap.allDoneTitle")} body={t("snap.allDoneBody")} />}
          <ResponsiveTable caption={t("snap.title")} columns={cols} rows={w.lines} rowKey={(l) => l.id} />
        </>
      )}
    </>
  );
}
