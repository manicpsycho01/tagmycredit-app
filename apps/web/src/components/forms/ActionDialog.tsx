"use client";
import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/server/contracts";
import { BottomSheet } from "../mobile";
import { useT } from "@/i18n/client";
import { SubmitButton } from "../ui/SubmitButton";
import { useActionForm } from "./useActionForm";
import { FormError } from "./FormError";

/**
 * A button that opens a focused dialog (bottom sheet on phones) with a form wired to one contract action.
 * `fields` receives `fieldError(name)` so each input shows its server-side error.
 */
export function ActionDialog<T>({ label, title, description, run, success, submitLabel, variant = "line", submitVariant = "amber", fields, triggerClassName = "", onDone }: {
  label: ReactNode; title: string; description?: ReactNode; run: (fd: FormData) => Promise<ActionResult<T>>; success?: string;
  submitLabel: string; variant?: "line" | "amber" | "teal" | "danger" | "ghost"; submitVariant?: "amber" | "danger" | "teal";
  fields?: (fieldError: (n: string) => string | null) => ReactNode; triggerClassName?: string; onDone?: (data: T) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const f = useActionForm(run, { success, onSuccess: (d) => { setOpen(false); onDone?.(d); } });
  return (
    <>
      <button type="button" className={`btn btn-${variant} ${triggerClassName}`} onClick={() => setOpen(true)}>{label}</button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title} description={description} closeLabel={t("common.close")}>
        <form className="form" onSubmit={f.onSubmit} noValidate>
          {fields?.(f.fieldError)}
          <FormError message={f.formError} />
          <div className="form-actions">
            <button type="button" className="btn btn-line" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
            <SubmitButton pending={f.pending} variant={submitVariant} pendingText={t("common.saving")}>{submitLabel}</SubmitButton>
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
