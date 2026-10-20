"use client";
import { useState } from "react";

export function CopyButton({ value, label, copiedLabel, children }: { value: string; label: string; copiedLabel: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="copy-btn" data-copied={copied} aria-label={copied ? copiedLabel : label}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
      }}>
      {children ?? value}
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}
