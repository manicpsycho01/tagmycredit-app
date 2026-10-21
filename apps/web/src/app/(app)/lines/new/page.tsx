import { getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { PageHead, AlertBox } from "@/components/ui/Basics";
import { NewLineWizard } from "./NewLineWizard";

export default async function NewLinePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [session, t, sp] = await Promise.all([getSession(), getT(), searchParams]);
  const verified = session?.company?.status === "VERIFIED";
  return (
    <div className="stack-lg">
      <PageHead title={t("newLine.title")} sub={t("newLine.sub")} />
      {!verified ? <AlertBox tone="info">{t("newLine.unverified")}</AlertBox>
        : <NewLineWizard q={sp.q} supplier={session!.company!} today={new Date().toISOString().slice(0, 10)} />}
    </div>
  );
}
