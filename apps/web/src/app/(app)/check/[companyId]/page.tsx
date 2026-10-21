import Link from "next/link";
import { notFound } from "next/navigation";
import { getScoreCard, getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { PageHead, Panel } from "@/components/ui/Basics";
import { ScoreCardView } from "@/components/score/Score";

export default async function ScorePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [card, session, t] = await Promise.all([getScoreCard(companyId), getSession(), getT()]);
  if (!card) notFound();
  const own = session?.company?.id === card.company.id;
  return (
    <div className="stack-lg">
      <PageHead title={t("score.title")} crumbs={<Link href="/check">{t("check.title")}</Link>}
        actions={<>{!own && <Link className="btn btn-amber" href={`/lines/new?q=${encodeURIComponent(card.company.tmcId)}`}>{t("check.tagThis")}</Link>}
          <Link className="btn btn-line" href="/check">{t("check.another")}</Link></>} />
      <Panel><ScoreCardView card={card} t={t} own={own} /></Panel>
    </div>
  );
}
