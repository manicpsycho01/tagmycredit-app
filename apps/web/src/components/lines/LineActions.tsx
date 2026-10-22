"use client";
import Link from "next/link";
import { useState } from "react";
import { TERMS_DAYS, type TermsDays } from "@tmc/domain";
import type { LineAction, LineDetail } from "@/server/contracts";
import * as A from "@/server/actions";
import { useT } from "@/i18n/client";
import { ActionDialog } from "../forms/ActionDialog";
import { halalas, num, str, useActionForm } from "../forms/useActionForm";
import { FormError } from "../forms/FormError";
import { Input, Select, Textarea } from "../ui/Field";
import { SubmitButton } from "../ui/SubmitButton";
import { BottomSheet } from "../mobile";
import { formatMoney, formatPeriod, halalasToSarInput } from "../format";

const files = (fd: FormData) => fd.getAll("files").filter((f) => f instanceof File && f.size > 0);

function SnapshotDialog({ d, period }: { d: LineDetail; period: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const last = d.snapshots[0];
  const keys = ["outstanding", "notDue", "d1_30", "d31_60", "d61_90", "d90Plus", "settledTotal", "settledOnTime"] as const;
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(keys.map((k) => [k, halalasToSarInput(last?.[k] ?? 0)])));
  const [needNote, setNeedNote] = useState(false);
  const h = (k: string) => Math.round((Number(v[k]) || 0) * 100);
  const sum = h("notDue") + h("d1_30") + h("d31_60") + h("d61_90") + h("d90Plus");
  const diff = sum - h("outstanding");
  const onTimeBad = h("settledOnTime") > h("settledTotal");
  const f = useActionForm(async (fd) => {
    const r = await A.submitSnapshot({
      lineId: d.line.id, period: str(fd, "period"), outstanding: halalas(fd, "outstanding"), notDue: halalas(fd, "notDue"), d1_30: halalas(fd, "d1_30"),
      d31_60: halalas(fd, "d31_60"), d61_90: halalas(fd, "d61_90"), d90Plus: halalas(fd, "d90Plus"), settledTotal: halalas(fd, "settledTotal"),
      settledOnTime: halalas(fd, "settledOnTime"), supplierNote: str(fd, "supplierNote") || undefined,
    });
    if (!r.ok && r.error === "errors.snapshotNeedsNote") setNeedNote(true);
    return r;
  }, { success: t("snap.done", { tclId: d.line.tclId }), onSuccess: () => setOpen(false) });
  const field = (k: (typeof keys)[number], label: string) => (
    <Input key={k} label={label} name={k} inputMode="decimal" dir="ltr" affix={t("common.sar")} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} error={f.fieldError(k)} />
  );
  return (
    <>
      <button type="button" className="btn btn-amber" onClick={() => setOpen(true)}>{t("action.SUBMIT_SNAPSHOT")}</button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("action.SUBMIT_SNAPSHOT")} description={`${d.line.tclId} · ${formatPeriod(period, t.locale)}`} closeLabel={t("common.close")}>
        <form className="form" onSubmit={f.onSubmit} noValidate>
          <input type="hidden" name="period" value={period} />
          {last && <p className="form-note">{t("snap.lastValues")}</p>}
          {field("outstanding", t("snap.outstanding"))}
          <span className="pk">{t("snap.bucketsTitle")}</span>
          <div className="form-row">{field("notDue", t("snap.notDue"))}{field("d1_30", t("snap.d1_30"))}{field("d31_60", t("snap.d31_60"))}{field("d61_90", t("snap.d61_90"))}{field("d90Plus", t("snap.d90Plus"))}</div>
          <p className={`bucket-sum ${diff === 0 ? "ok" : "bad"}`} aria-live="polite">
            {diff === 0 ? t("snap.sumOk") : t("snap.sumOff", { sum: formatMoney(sum, t.locale), outstanding: formatMoney(h("outstanding"), t.locale), diff: formatMoney(Math.abs(diff), t.locale) })}
          </p>
          <span className="pk">{t("snap.settledTitle")}</span>
          <div className="form-row">{field("settledTotal", t("snap.settledTotal"))}{field("settledOnTime", t("snap.settledOnTime"))}</div>
          {onTimeBad && <p className="bucket-sum bad">{t("snap.onTimeTooHigh")}</p>}
          {needNote && <Textarea label={t("snap.noteLabel")} hint={t("snap.noteHint")} name="supplierNote" required error={f.fieldError("supplierNote")} />}
          <FormError message={f.errorKey === "errors.snapshotNeedsNote" ? t("snap.noteHint") : f.formError} />
          <div className="form-actions"><SubmitButton pending={f.pending} disabled={diff !== 0 || onTimeBad} pendingText={t("common.saving")}>{t("snap.submit")}</SubmitButton></div>
        </form>
      </BottomSheet>
    </>
  );
}

export function LineActions({ d, snapshotPeriod }: { d: LineDetail; snapshotPeriod: string }) {
  const t = useT();
  const pending = d.versions.find((v) => v.status === "PENDING");
  const current = d.versions.find((v) => v.status === "CONFIRMED");
  const openDispute = d.disputes.find((x) => x.status === "OPEN" || x.status === "RESPONDED");
  const openClosure = d.closures.find((x) => x.status === "OPEN");
  const def = d.defaults.find((x) => x.status === "UNDER_REVIEW" || x.status === "INFO_REQUESTED") ?? d.defaults.find((x) => x.status === "UPHELD");
  const latest = d.snapshots[0];
  const id = d.line.id;
  const reasonField = (label: string, name = "reason", ph?: string) => (fe: (n: string) => string | null) => <Textarea label={label} name={name} required placeholder={ph} error={fe(name)} />;

  const render = (a: LineAction) => {
    switch (a) {
      case "CONFIRM": return <Link key={a} className="btn btn-amber" href={`/lines/${id}/confirm`}>{t("line.openConfirm")}</Link>;
      case "SUBMIT_SNAPSHOT": return <SnapshotDialog key={a} d={d} period={snapshotPeriod} />;
      case "AMEND": return <ActionDialog key={a} label={t("action.AMEND")} title={t("amend.title")} description={t("amend.sub")} submitLabel={t("amend.submit")} success={t("amend.done")}
        run={(fd) => A.amendLine({ lineId: id, limitSar: num(fd, "limitSar"), termsDays: Number(str(fd, "termsDays")) as TermsDays, effectiveDate: str(fd, "effectiveDate") })}
        fields={(fe) => <>
          <Input label={t("newLine.limit")} name="limitSar" inputMode="decimal" dir="ltr" affix={t("common.sar")} defaultValue={halalasToSarInput(current?.limitHalalas)} error={fe("limitSar")} hint={t("newLine.limitHint")} />
          <Select label={t("newLine.terms")} name="termsDays" defaultValue={current?.termsDays ?? 60} error={fe("termsDays")}>{TERMS_DAYS.map((x) => <option key={x} value={x}>{t("common.net", { n: x })}</option>)}</Select>
          <Input label={t("newLine.effective")} name="effectiveDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} error={fe("effectiveDate")} />
        </>} />;
      case "CLOSE": return <ActionDialog key={a} label={t("action.CLOSE")} title={t("close.title")} description={t("close.sub")} submitLabel={t("close.submit")} submitVariant="danger" success={t("close.done")}
        run={(fd) => A.closeLine({ lineId: id, reason: str(fd, "reason") })} fields={reasonField(t("common.reason"), "reason", t("close.reasonPlaceholder"))} />;
      case "FILE_DEFAULT": return <ActionDialog key={a} label={t("action.FILE_DEFAULT")} variant="danger" title={t("default.title")} description={t("default.sub")} submitLabel={t("default.submit")} success={t("default.done")}
        run={(fd) => { fd.set("lineId", id); return A.fileDefault(fd); }}
        fields={(fe) => <>
          <Input label={t("default.amount")} name="amountSar" inputMode="decimal" dir="ltr" affix={t("common.sar")} defaultValue={halalasToSarInput(latest?.d90Plus)} hint={t("default.amountHint", { max: formatMoney(latest?.d90Plus ?? 0, t.locale) })} error={fe("amountSar")} />
          <Input label={t("default.oldest")} name="oldestDueDate" type="date" error={fe("oldestDueDate")} />
          <Textarea label={t("default.note")} name="note" required error={fe("note")} />
          <Input label={t("default.files")} name="files" type="file" multiple accept="application/pdf,image/png,image/jpeg" className="file-input" error={fe("files")} />
          <p className="form-note">{t("default.anonNote")}</p>
        </>} />;
      case "DISPUTE": return <ActionDialog key={a} label={t("action.DISPUTE")} title={t("dispute.title")} description={t("dispute.sub")} submitLabel={t("dispute.submit")} success={t("dispute.done")}
        run={(fd) => { fd.set("lineId", id); if (files(fd).length === 0) return Promise.resolve({ ok: false as const, error: "errors.validation", fieldErrors: { files: "errors.evidenceRequired" } }); return A.openDispute(fd); }}
        fields={(fe) => <>
          <Textarea label={t("dispute.reason")} name="reason" required error={fe("reason")} />
          <Input label={t("dispute.files")} name="files" type="file" multiple required accept="application/pdf,image/png,image/jpeg" className="file-input" error={fe("files")} />
        </>} />;
      case "REQUEST_CLOSURE": return <ActionDialog key={a} label={t("action.REQUEST_CLOSURE")} title={t("closure.title")} description={t("closure.sub")} submitLabel={t("closure.submit")} success={t("closure.done")}
        run={(fd) => A.requestClosure({ lineId: id, reason: str(fd, "reason") })} fields={reasonField(t("common.reason"))} />;
      case "DECLINE": return pending ? <ActionDialog key={a} label={t("action.DECLINE")} title={t("decline.title")} description={t("decline.sub")} submitLabel={t("decline.submit")} submitVariant="danger" success={t("decline.done")}
        run={(fd) => A.declineVersion({ versionId: pending.id, reason: str(fd, "reason") || undefined })} fields={(fe) => <Textarea label={t("decline.reason")} name="reason" error={fe("reason")} />} /> : null;
      case "RESPOND_DISPUTE": return openDispute ? <ActionDialog key={a} variant="amber" label={t("action.RESPOND_DISPUTE")} title={t("respondDispute.title")} description={openDispute.reason} submitLabel={t("respondDispute.submit")} success={t("respondDispute.done")}
        run={(fd) => A.respondDispute({ disputeId: openDispute.id, response: str(fd, "response") })} fields={reasonField(t("respondDispute.response"), "response")} /> : null;
      case "RESPOND_CLOSURE": return openClosure ? <span key={a} className="row">
        <ActionDialog variant="amber" label={t("respondClosure.accept")} title={t("respondClosure.title")} description={`${t("respondClosure.sub")} — ${openClosure.reason}`} submitLabel={t("respondClosure.accept")} success={t("respondClosure.doneAccept")}
          run={() => A.respondClosure({ closureId: openClosure.id, accept: true })} />
        <ActionDialog label={t("respondClosure.object")} title={t("respondClosure.title")} description={openClosure.reason} submitLabel={t("respondClosure.object")} success={t("respondClosure.doneObject")}
          run={(fd) => A.respondClosure({ closureId: openClosure.id, accept: false, objection: str(fd, "objection") })} fields={reasonField(t("respondClosure.objection"), "objection")} />
      </span> : null;
      case "REPLY_DEFAULT": return def ? <ActionDialog key={a} variant="amber" label={t("action.REPLY_DEFAULT")} title={t("replyDefault.title")} description={t("replyDefault.sub")} submitLabel={t("replyDefault.submit")} success={t("replyDefault.done")}
        run={(fd) => A.replyDefault({ defaultId: def.id, reply: str(fd, "reply") })} fields={reasonField(t("replyDefault.reply"), "reply")} /> : null;
      case "RETRACT_DEFAULT": return def ? <ActionDialog key={a} label={t("action.RETRACT_DEFAULT")} title={t("retract.title")} description={t("retract.sub")} submitLabel={t("retract.submit")} submitVariant="danger" success={t("retract.done")}
        run={() => A.retractDefault({ defaultId: def.id })} /> : null;
      case "MARK_DEFAULT_SETTLED": return def ? <ActionDialog key={a} label={t("action.MARK_DEFAULT_SETTLED")} title={t("settled.title")} description={t("settled.sub")} submitLabel={t("settled.submit")} success={t("settled.done")}
        run={() => A.markDefaultSettled({ defaultId: def.id })} /> : null;
      default: return null;
    }
  };
  if (d.actions.length === 0) return <p className="muted small">{t("line.noActions")}</p>;
  // While a closure request is open, "Close the line" (accept) already closes it — don't show a second close button.
  const shown = openClosure && d.actions.includes("RESPOND_CLOSURE") ? d.actions.filter((a) => a !== "CLOSE") : d.actions;
  return <div className="action-bar">{shown.map(render)}</div>;
}
