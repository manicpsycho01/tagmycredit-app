"use client";
import { useEffect } from "react";
import { useT } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="state-page" role="alert">
      <span className="code">!</span>
      <h1>{t("state.errorTitle")}</h1>
      <p>{t("state.errorBody")}</p>
      {error.digest && <code className="small muted">{error.digest}</code>}
      <div className="row"><button type="button" className="btn btn-amber" onClick={reset}>{t("common.retry")}</button><a className="btn btn-line" href="/">{t("state.goHome")}</a></div>
    </div>
  );
}
