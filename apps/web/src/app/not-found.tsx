import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="state-page wrap" id="main">
      <span className="code">404</span>
      <h1>{t("state.notFoundTitle")}</h1>
      <p>{t("state.notFoundBody")}</p>
      <Link className="btn btn-amber" href="/">{t("state.goHome")}</Link>
    </main>
  );
}
