import { getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { PageHead, AlertBox } from "@/components/ui/Basics";
import { CheckLookup } from "./CheckLookup";

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [session, t, sp] = await Promise.all([getSession(), getT(), searchParams]);
  return (
    <div className="stack-lg">
      <PageHead title={t("check.title")} sub={t("check.sub")} />
      {session?.company?.status !== "VERIFIED" && <AlertBox tone="info">{t("check.unverified")}</AlertBox>}
      <CheckLookup q={sp.q} />
    </div>
  );
}
