"use client";
import { useActionForm, str } from "../forms/useActionForm";
import { lookupCompany } from "@/server/actions";
import type { LookupResult } from "@/server/contracts";
import { useT } from "@/i18n/client";
import { SubmitButton } from "../ui/SubmitButton";

/** Exact TMC-ID / CR lookup on a teal band. */
export function LookupForm({ label, cta, onFound, defaultValue }: { label: string; cta: string; onFound: (r: LookupResult) => void; defaultValue?: string }) {
  const t = useT();
  const f = useActionForm(async (fd) => lookupCompany(str(fd, "q")), { onSuccess: (r) => { if (r) onFound(r); } });
  const notFound = f.state?.ok && f.state.data === null;
  return (
    <form className="lookup-hero band" onSubmit={f.onSubmit}>
      <label htmlFor="lookup-q">{label}</label>
      <div className="lookup">
        <input id="lookup-q" name="q" className="input" required defaultValue={defaultValue} autoComplete="off" autoCapitalize="characters" spellCheck={false} dir="ltr"
          placeholder={t("newLine.lookupPlaceholder")} aria-describedby="lookup-hint" />
        <SubmitButton pending={f.pending} pendingText={t("newLine.finding")}>{cta}</SubmitButton>
      </div>
      <span className="hint" id="lookup-hint">{t("newLine.lookupHint")}</span>
      {(notFound || f.formError) && <span className="err" role="alert">{notFound ? t("newLine.notFound") : f.formError}</span>}
    </form>
  );
}
