"use client";
import { useTransition } from "react";
import { markNotificationsRead } from "@/server/actions";
import { useT } from "@/i18n/client";
import { useToast } from "@/components/ui/Toast";

export function MarkAllRead() {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-line" disabled={pending} onClick={() => start(async () => {
      const r = await markNotificationsRead();
      toast(r.ok ? t("alerts.marked") : t.dyn(r.error), r.ok ? "success" : "error");
    })}>{t("alerts.markAll")}</button>
  );
}
