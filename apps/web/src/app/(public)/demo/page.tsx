import { getSession, listDemoPersonas } from "@/server/queries";
import { getT } from "@/i18n/server";
import { AuthFrame } from "@/components/public/AuthFrame";
import { EmptyState } from "@/components/ui/Basics";
import { PersonaPicker } from "./PersonaPicker";

export const metadata = { title: "Demo" };

export default async function DemoPage() {
  const t = await getT();
  const demoMode = process.env.DEMO_MODE === "true";
  const [personas, session] = await Promise.all([demoMode ? listDemoPersonas().catch(() => []) : Promise.resolve([]), getSession().catch(() => null)]);
  return (
    <AuthFrame t={t} wide>
      <div className="stack" style={{ gap: 6 }}>
        <p className="kicker">{t("demo.kicker")}</p>
        <h1>{t("demo.title")}</h1>
        <p className="muted">{t("demo.sub")}</p>
        {session && <p className="small muted">{session.user.email}</p>}
      </div>
      {!demoMode ? <EmptyState title={t("demo.unavailable")} /> : personas.length === 0 ? <EmptyState title={t("demo.empty")} /> : (
        <>
          <PersonaPicker personas={personas} />
          <p className="small muted">{t("demo.password", { password: "TagMyCredit-Demo-2026" })}</p>
        </>
      )}
    </AuthFrame>
  );
}
