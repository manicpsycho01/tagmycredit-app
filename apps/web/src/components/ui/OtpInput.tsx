"use client";
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { useT } from "@/i18n/client";

/** 6 boxes, numeric keyboard, paste support, auto-advance; value lives in a hidden input named `name`. */
export function OtpInput({ name = "code", length = 6, invalid = false, onComplete, disabled }: { name?: string; length?: number; invalid?: boolean; onComplete?: (code: string) => void; disabled?: boolean }) {
  const t = useT();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const hidden = useRef<HTMLInputElement>(null);
  const sync = () => {
    const code = refs.current.map((r) => r?.value ?? "").join("");
    if (hidden.current) hidden.current.value = code;
    refs.current.forEach((r) => r?.classList.toggle("filled", !!r?.value));
    if (code.length === length && /^\d+$/.test(code)) onComplete?.(code);
  };
  const fill = (from: number, digits: string) => {
    digits.split("").slice(0, length - from).forEach((d, k) => { const el = refs.current[from + k]; if (el) el.value = d; });
    refs.current[Math.min(from + digits.length, length - 1)]?.focus();
    sync();
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (e.key === "Backspace" && !el.value && i > 0) { const p = refs.current[i - 1]; if (p) { p.value = ""; p.focus(); sync(); } e.preventDefault(); }
    if (e.key === "ArrowLeft") refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight") refs.current[i + 1]?.focus();
  };
  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const d = e.clipboardData.getData("text").replace(/\D/g, "");
    if (d) { e.preventDefault(); fill(i, d); }
  };
  return (
    <div className="otp" role="group" aria-label={t("confirm.enterCode")} aria-invalid={invalid || undefined}>
      <input ref={hidden} type="hidden" name={name} />
      {Array.from({ length }, (_, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} pattern="[0-9]*"
          maxLength={length} aria-label={t("confirm.otpLabel", { n: i + 1 })} disabled={disabled} autoFocus={i === 0}
          onChange={(e) => { const d = e.currentTarget.value.replace(/\D/g, ""); if (d.length > 1) fill(i, d); else { e.currentTarget.value = d; if (d) refs.current[i + 1]?.focus(); sync(); } }}
          onKeyDown={(e) => onKey(i, e)} onPaste={(e) => onPaste(i, e)} onFocus={(e) => e.currentTarget.select()} />
      ))}
    </div>
  );
}
