import Link from "next/link";
import { getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { PublicHeader } from "@/components/public/PublicHeader";
import { CreditLineDoc } from "@/components/lines/CreditLineDoc";
import { CheckIcon, LockIcon } from "@/components/ui/Basics";

export default async function Landing() {
  const [session, t] = await Promise.all([getSession().catch(() => null), getT()]);
  const demoMode = session?.demoMode ?? process.env.DEMO_MODE === "true";
  const ex = { id: "x", legalName: "Al Noor Building Materials", legalNameAr: "النور لمواد البناء", tmcId: "TMC-SA-4821-7730-01-H" };
  const ex2 = { id: "y", legalName: "Qimma Contracting", legalNameAr: "قمة للمقاولات", tmcId: "TMC-SA-9134-2208-01-4" };
  return (
    <>
      <PublicHeader t={t} signedIn={!!session} demoMode={demoMode} />
      <main id="main">
        <section className="band landing-hero">
          <div className="wrap landing-grid">
            <div>
              <p className="kicker">{t("landing.kicker")}</p>
              <h1 style={{ marginTop: 18 }}><span>{t("landing.h1a")}</span><span className="hl">{t("landing.h1b")}</span><span>{t("landing.h1c")}</span></h1>
              <p className="alt" lang={t.locale === "ar" ? "en" : "ar"} dir={t.locale === "ar" ? "ltr" : "rtl"}>{t.locale === "ar" ? t("landing.alt") : "سجّل الائتمان. اعرف المخاطر. احمِ إيراداتك."}</p>
              <p className="sub">{t("landing.sub")}</p>
              <div className="cta">
                {session ? <Link className="btn btn-amber" href="/home">{t("landing.ctaOpenApp")}</Link> : <>
                  {demoMode && <Link className="btn btn-amber" href="/demo">{t("landing.ctaDemo")}</Link>}
                  <Link className="btn btn-line" href="/sign-in">{t("landing.ctaSignIn")}</Link>
                </>}
              </div>
              <p className="fine"><span>{t("landing.fine1")}</span><span>{t("landing.fine2")}</span><span>{t("landing.fine3")}</span></p>
            </div>
            <CreditLineDoc t={t} tclId="TCL-SA-0847291" supplier={ex} buyer={ex2} limitHalalas={240_000_000} termsDays={90} effectiveDate="2026-10-01"
              stamp="verified" tag={<span className="eg-tag">{t("common.example")}</span>} buyerScore={{ score: 750, band: "GOOD", light: "GREEN" }} />
          </div>
        </section>
        <section className="promises wrap">
          <p className="kicker">{t("landing.howKicker")}</p>
          <h2 style={{ margin: "10px 0 24px", fontSize: "clamp(1.6rem,3.4vw,2.4rem)" }}>{t("landing.howTitle")}</h2>
          <ol className="hw">
            <li><h3>{t("landing.step1Title")}</h3><p>{t("landing.step1Body")}</p></li>
            <li><h3>{t("landing.step2Title")}</h3><p>{t("landing.step2Body")}</p></li>
            <li><h3>{t("landing.step3Title")}</h3><p>{t("landing.step3Body")}</p></li>
          </ol>
          <h2 style={{ marginTop: 48, fontSize: "clamp(1.4rem,3vw,2rem)" }}>{t("landing.privTitle")}</h2>
          <div className="priv">
            <div className="yes"><h3>{t("landing.privYes")}</h3><ul>
              {(["landing.yes1", "landing.yes2", "landing.yes3", "landing.yes4", "landing.yes5"] as const).map((k) => <li key={k}><span style={{ color: "var(--ok)" }}><CheckIcon /></span><span>{t(k)}</span></li>)}
            </ul></div>
            <div className="no"><h3>{t("landing.privNo")}</h3><ul>
              {(["landing.no1", "landing.no2", "landing.no3"] as const).map((k) => <li key={k}><span style={{ color: "var(--amber)" }}><LockIcon /></span><span>{t(k)}</span></li>)}
            </ul></div>
          </div>
        </section>
      </main>
      <footer className="pub-foot"><div className="wrap">{t("landing.footer")}</div></footer>
    </>
  );
}
