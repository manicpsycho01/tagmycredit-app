"use client";
import Link from "next/link";
import { useState } from "react";
import type { LineDetail, LineVersionView } from "@/server/contracts";
import { confirmVersion, requestOtp } from "@/server/actions";
import { useT } from "@/i18n/client";
import { useActionForm, str } from "../forms/useActionForm";
import { FormError } from "../forms/FormError";
import { OtpInput } from "../ui/OtpInput";
import { SubmitButton } from "../ui/SubmitButton";
import { formatDateTime } from "../format";

/** CFO: send code → enter OTP → confirmed. */
export function ConfirmFlow({ d, version, demoMode }: { d: LineDetail; version: LineVersionView; demoMode: boolean }) {
  const t = useT();
  const [sent, setSent] = useState<{ sentTo: string; expiresAt: string } | null>(null);
  const [done, setDone] = useState(false);
  const send = useActionForm(async () => requestOtp({ versionId: version.id }), { onSuccess: (r) => setSent(r) });
  const confirm = useActionForm(async (fd) => confirmVersion({ versionId: version.id, code: str(fd, "code") }), { onSuccess: () => setDone(true) });
  if (done) return (
    <div className="done-state">
      <span className="big-tick" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 16 16"><path d="M2 8.5 6 12l8-8" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg></span>
      <h2>{t("confirm.doneTitle")}</h2><p className="muted">{t("confirm.doneBody", { tclId: d.line.tclId })}</p>
      <Link className="btn btn-amber" href={`/lines/${d.line.id}`}>{t("newLine.viewLine")}</Link>
    </div>
  );
  const locked = version.lockedUntil && new Date(version.lockedUntil).getTime() > Date.now();
  return (
    <div className="otp-panel">
      <div className="consent"><b>{t("confirm.consentTitle")}</b><br />{t("confirm.consent")}</div>
      {locked && <FormError message={t("confirm.locked", { time: formatDateTime(version.lockedUntil, t.locale) })} />}
      {!sent ? (
        <form onSubmit={send.onSubmit} className="stack">
          <p className="small muted">{t("confirm.reauth")}</p>
          <FormError message={send.formError} />
          <SubmitButton pending={send.pending} pendingText={t("confirm.sending")} disabled={!!locked} className="btn-block">{t("confirm.sendCode")}</SubmitButton>
        </form>
      ) : (
        <form onSubmit={confirm.onSubmit} className="stack">
          <p className="sent">{t("confirm.sentTo", { phone: sent.sentTo })} {t("confirm.expires", { time: formatDateTime(sent.expiresAt, t.locale) })}</p>
          <OtpInput invalid={!!confirm.formError} />
          <FormError message={confirm.formError} />
          <SubmitButton pending={confirm.pending} pendingText={t("confirm.confirming")} className="btn-block">{t("confirm.confirm")}</SubmitButton>
          <button type="button" className="btn btn-ghost btn-sm" disabled={send.pending} onClick={() => setSent(null)}>{t("confirm.resend")}</button>
        </form>
      )}
      {demoMode && <p className="small muted">{t("confirm.devHint")} <Link className="link" href="/dev/outbox" target="_blank">{t("confirm.openOutbox")}</Link></p>}
    </div>
  );
}
