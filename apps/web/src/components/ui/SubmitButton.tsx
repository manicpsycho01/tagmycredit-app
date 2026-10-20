"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Submit button with pending state: uses an explicit `pending` prop, or the parent form's status. */
export function SubmitButton({ children, pendingText, pending, variant = "amber", className = "", disabled, name, value }: {
  children: ReactNode; pendingText?: ReactNode; pending?: boolean; variant?: "amber" | "line" | "teal" | "danger"; className?: string; disabled?: boolean; name?: string; value?: string;
}) {
  const status = useFormStatus();
  const busy = pending ?? status.pending;
  return (
    <button type="submit" name={name} value={value} className={`btn btn-${variant} ${className}`} disabled={disabled || busy} data-pending={busy} aria-busy={busy}>
      {busy && <span className="spinner" aria-hidden="true" />}
      {busy && pendingText ? pendingText : children}
    </button>
  );
}
