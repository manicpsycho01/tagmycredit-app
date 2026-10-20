"use client";
import { startTransition, useActionState, useCallback, type FormEvent } from "react";
import type { ActionResult } from "@/server/contracts";
import { useT } from "@/i18n/client";
import { useToast } from "../ui/Toast";

type Result<T> = ActionResult<T> | null;

function isNextControlFlow(e: unknown): boolean {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === "string" && d.startsWith("NEXT_");
}

/**
 * React 19 form helper around a contract action. Submits via onSubmit + useActionState (no automatic form reset,
 * so input is never lost on error), toasts on success, and exposes translated form/field errors.
 */
export function useActionForm<T>(
  run: (fd: FormData) => Promise<ActionResult<T>>,
  opts: { success?: string | ((data: T) => string); onSuccess?: (data: T, fd: FormData) => void; reset?: boolean } = {},
) {
  const t = useT();
  const toast = useToast();
  const [state, dispatch, pending] = useActionState<Result<T>, { fd: FormData; form: HTMLFormElement | null }>(async (_prev, { fd, form }) => {
    let r: ActionResult<T>;
    try {
      r = await run(fd);
    } catch (e) {
      if (isNextControlFlow(e)) throw e;
      r = { ok: false, error: "errors.network" };
    }
    if (r.ok) {
      const msg = typeof opts.success === "function" ? opts.success(r.data) : opts.success;
      if (msg) toast(msg);
      if (opts.reset && form) form.reset();
      opts.onSuccess?.(r.data, fd);
    }
    return r;
  }, null);

  const onSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form, (e.nativeEvent as SubmitEvent).submitter ?? undefined);
    startTransition(() => dispatch({ fd, form }));
  }, [dispatch]);

  const failed = state && !state.ok ? state : null;
  const fieldErrors = failed?.fieldErrors ?? {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  return {
    state,
    pending,
    onSubmit,
    data: state && state.ok ? state.data : null,
    formError: failed && !(hasFieldErrors && failed.error === "errors.validation") ? t.dyn(failed.error) : null,
    fieldError: (name: string) => (fieldErrors[name] ? t.dyn(fieldErrors[name]) : null),
    errorKey: failed?.error ?? null,
  };
}

/** FormData helpers */
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const num = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/[,\s]/g, "");
  return v === "" ? Number.NaN : Number(v);
};
/** SAR string → integer halalas (NaN when empty/invalid). */
export const halalas = (fd: FormData, k: string) => {
  const n = num(fd, k);
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
};
