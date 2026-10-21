import Link from "next/link";
import { notFound } from "next/navigation";
import { getLine, getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { PageHead, EmptyState, AlertBox } from "@/components/ui/Basics";
import { CreditLineDoc } from "@/components/lines/CreditLineDoc";
import { ConfirmFlow } from "@/components/lines/ConfirmFlow";
import { LineActions } from "@/components/lines/LineActions";
import { companyName } from "@/components/format";

export default async function ConfirmPage({ params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const [d, session, t] = await Promise.all([getLine(lineId), getSession(), getT()]);
  if (!d) notFound();
  const v = d.versions.find((x) => x.status === "PENDING");
  const canConfirm = d.actions.includes("CONFIRM");
  return (
    <div className="stack-lg">
      <PageHead title={v && v.version > 1 ? t("confirm.titleAmend", { tclId: d.line.tclId }) : t("confirm.title", { tclId: d.line.tclId })} sub={t("confirm.sub")}
        crumbs={<Link href={`/lines/${d.line.id}`}>{d.line.tclId}</Link>} />
      {!v ? <EmptyState title={t("confirm.nothingPending")} actions={<Link className="btn btn-line" href={`/lines/${d.line.id}`}>{t("newLine.viewLine")}</Link>} /> : (
        <div className="confirm-grid">
          <CreditLineDoc t={t} tclId={d.line.tclId} supplier={d.supplier} buyer={d.buyer} limitHalalas={v.limitHalalas} termsDays={v.termsDays} effectiveDate={v.effectiveDate}
            version={v.version} stamp="pending" attestation={v.attestation} tag={<span className="eg-tag">{t("confirm.kicker")}</span>} />
          <div className="panel panel-accent stack">
            {canConfirm ? <ConfirmFlow d={d} version={v} demoMode={!!session?.demoMode} /> : <AlertBox tone="info">{t("confirm.notCfo", { company: companyName(d.buyer, t.locale) })}</AlertBox>}
            {d.actions.includes("DECLINE") && <LineActions d={{ ...d, actions: ["DECLINE"] }} snapshotPeriod="" />}
          </div>
        </div>
      )}
    </div>
  );
}
