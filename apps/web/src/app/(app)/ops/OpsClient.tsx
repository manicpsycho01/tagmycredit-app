"use client";
import { useState, useTransition } from "react";
import { decideCfo, decideSnapshot, runScoreRelease, runTick, verifyCompany } from "@/server/actions";
import type { ActionResult } from "@/server/contracts";
import { useT } from "@/i18n/client";
import { useToast } from "@/components/ui/Toast";
import { formatPeriod } from "@/components/format";

export function DecideButtons({ kind, id }: { kind: "company" | "cfo" | "snapshot"; id: string }) {
  const t = useT();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [waive, setWaive] = useState(false);
  const [pending, start] = useTransition();
  const go = (approve: boolean) => start(async () => {
    let r: ActionResult;
    if (kind === "company") r = await verifyCompany({ companyId: id, approve, note: note || undefined });
    else if (kind === "cfo") r = await decideCfo({ cfoId: id, approve, waiveCoolingOff: waive, note: note || undefined });
    else {
      if (!note.trim()) { toast(t("ops.noteRequired"), "error"); return; }
      r = await decideSnapshot({ snapshotId: id, release: approve, note });
    }
    toast(r.ok ? (approve ? (kind === "cfo" ? t("ops.cfoApproved") : kind === "company" ? t("ops.verified") : t("ops.snapshotReleased")) : t("ops.rejected")) : t.dyn(r.error), r.ok ? "success" : "error");
  });
  return (
    <div className="stack" style={{ gap: 10 }}>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("ops.notePlaceholder")} aria-label={t("ops.note")} />
      {kind === "cfo" && <label className="check-field"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />{t("ops.waive")}</label>}
      <div className="row">
        <button type="button" className="btn btn-amber btn-sm" disabled={pending} onClick={() => go(true)}>{kind === "snapshot" ? t("ops.releaseSnapshot") : t("ops.approve")}</button>
        <button type="button" className="btn btn-line btn-sm" disabled={pending} onClick={() => go(false)}>{t("ops.reject")}</button>
      </div>
    </div>
  );
}

export function ReleaseButtons() {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="row">
      <button type="button" className="btn btn-amber" disabled={pending} aria-busy={pending} onClick={() => start(async () => {
        const r = await runScoreRelease();
        toast(r.ok ? t("ops.released", { period: formatPeriod(r.data.period, t.locale), scored: r.data.companiesScored, suppressed: r.data.companiesSuppressed }) : t.dyn(r.error), r.ok ? "success" : "error");
      })}>{pending && <span className="spinner" aria-hidden="true" />}{pending ? t("ops.running") : t("ops.runNow")}</button>
      <button type="button" className="btn btn-line" disabled={pending} onClick={() => start(async () => {
        const r = await runTick();
        toast(r.ok ? t("ops.tickDone") : t.dyn(r.error), r.ok ? "success" : "error");
      })}>{t("ops.runTick")}</button>
    </div>
  );
}
