"use client";
import Link from "next/link";
import { useState } from "react";
import { LIMIT_MAX_HALALAS, LIMIT_MIN_HALALAS, TERMS_DAYS, type TermsDays } from "@tmc/domain";
import type { CompanyRef, LookupResult } from "@/server/contracts";
import { createLine } from "@/server/actions";
import { useT } from "@/i18n/client";
import { LookupForm } from "@/components/lines/LookupForm";
import { CreditLineDoc } from "@/components/lines/CreditLineDoc";
import { useActionForm } from "@/components/forms/useActionForm";
import { FormError } from "@/components/forms/FormError";
import { Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AlertBox, Panel } from "@/components/ui/Basics";
import { companyName, formatMoney } from "@/components/format";

export function NewLineWizard({ q, supplier, today }: { q?: string; supplier: CompanyRef; today: string }) {
  const t = useT();
  const [found, setFound] = useState<LookupResult | null>(null);
  const [limit, setLimit] = useState("");
  const [terms, setTerms] = useState<TermsDays>(60);
  const [date, setDate] = useState(today);
  const sar = Number(limit.replace(/[,\s]/g, ""));
  const halalas = Number.isFinite(sar) ? Math.round(sar * 100) : NaN;
  const limitOk = halalas >= LIMIT_MIN_HALALAS && halalas <= LIMIT_MAX_HALALAS;
  const f = useActionForm(async () => createLine({ buyerCompanyId: found!.company.id, limitSar: sar, termsDays: terms, effectiveDate: date }));
  const step = !found ? 1 : f.data ? 3 : 2;

  if (f.data && found) {
    return (
      <Panel className="done-state">
        <span className="big-tick" aria-hidden="true">✓</span>
        <h2>{t("newLine.sentTitle")}</h2>
        <p className="muted">{t("newLine.sentBody", { buyer: companyName(found.company, t.locale), tclId: f.data.tclId })}</p>
        <div className="row"><Link className="btn btn-amber" href={`/lines/${f.data.lineId}`}>{t("newLine.viewLine")}</Link>
          <button type="button" className="btn btn-line" onClick={() => { setFound(null); setLimit(""); location.reload(); }}>{t("newLine.another")}</button></div>
      </Panel>
    );
  }
  return (
    <>
      <ol className="steps-bar" aria-label={t("newLine.title")}>
        {[t("newLine.step1"), t("newLine.step2"), t("newLine.step3")].map((s, i) => (
          <li key={s} data-state={i + 1 < step ? "done" : i + 1 === step ? "current" : "todo"} aria-current={i + 1 === step ? "step" : undefined}>{s}</li>
        ))}
      </ol>
      {!found ? <LookupForm label={t("newLine.lookupLabel")} cta={t("newLine.find")} defaultValue={q} onFound={setFound} /> : (
        <div className="split">
          <form className="form panel panel-accent" onSubmit={f.onSubmit} noValidate>
            <div className="found">
              <span className="co-mark" aria-hidden="true">{companyName(found.company, t.locale).charAt(0)}</span>
              <div className="stack" style={{ gap: 0 }}><b>{companyName(found.company, t.locale)}</b><small className="muted ltr">{found.company.tmcId} · {found.company.city}</small></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFound(null)}>{t("newLine.change")}</button>
            </div>
            {!found.canTag ? <AlertBox tone="warn" title={t("newLine.cannotTag")}>{t.dyn(found.cannotTagReason ?? "errors.forbidden")}</AlertBox> : <>
              <Input label={t("newLine.limit")} name="limitSar" inputMode="decimal" autoComplete="off" affix={t("common.sar")} value={limit} onChange={(e) => setLimit(e.target.value)}
                hint={t("newLine.limitHint")} error={f.fieldError("limitSar") ?? (limit && !limitOk ? t("newLine.limitHint") : null)} dir="ltr" />
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label">{t("newLine.terms")}</legend>
                <div className="radio-cards">
                  {TERMS_DAYS.map((d) => (
                    <label key={d}><input type="radio" name="termsDays" value={d} checked={terms === d} onChange={() => setTerms(d)} /><span>{t("common.net", { n: d })}</span></label>
                  ))}
                </div>
              </fieldset>
              <Input label={t("newLine.effective")} name="effectiveDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={f.fieldError("effectiveDate")} />
              <p className="form-note">{t("newLine.attestation")}</p>
              <FormError message={f.formError} />
              <SubmitButton pending={f.pending} pendingText={t("newLine.sending")} disabled={!limitOk} className="btn-block">{t("newLine.send")}</SubmitButton>
            </>}
          </form>
          <div className="stack">
            <span className="pk">{t("newLine.review")}</span>
            <CreditLineDoc t={t} tclId={null} supplier={supplier} buyer={found.company} limitHalalas={limitOk ? halalas : 0} termsDays={terms} effectiveDate={date}
              stamp="preview" animate={false} attestation={t("newLine.attestation")} footer={<><span>{t("doc.limit")}</span><b className="num">{limitOk ? formatMoney(halalas, t.locale) : "—"}</b></>} />
          </div>
        </div>
      )}
    </>
  );
}
