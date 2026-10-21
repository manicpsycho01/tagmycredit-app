"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/core";

const KEYS: MessageKey[] = ["anat.prefix", "anat.country", "anat.random", "anat.cr", "anat.seq", "anat.check"];

/** The website's TMC-ID anatomy: hover/focus previews a segment, click pins it. */
export function TmcIdAnatomy({ tmcId, onTeal = false }: { tmcId: string; onTeal?: boolean }) {
  const t = useT();
  const segs = tmcId.split("-");
  const [pin, setPin] = useState<number | null>(null);
  const [prev, setPrev] = useState<number | null>(null);
  const cur = prev ?? pin;
  return (
    <div className={`anat ${onTeal ? "on-teal" : ""}`} role="group" aria-label={t("anat.label")}>
      <div className="segs">
        {segs.map((s, i) => (
          <span key={i} style={{ display: "contents" }}>
            {i > 0 && <span className="dash" aria-hidden="true">-</span>}
            <button type="button" className={cur === i ? "on" : ""} aria-pressed={pin === i} aria-label={`${s}: ${t(KEYS[i] ?? "anat.check")}`}
              onMouseEnter={() => setPrev(i)} onMouseLeave={() => setPrev(null)} onFocus={() => setPrev(i)} onBlur={() => setPrev(null)}
              onClick={() => setPin(pin === i ? null : i)}>{s}</button>
          </span>
        ))}
      </div>
      <p className="out" aria-live="polite">{cur != null && <><b>{segs[cur]}</b><span>{t(KEYS[cur] ?? "anat.check")}</span></>}</p>
      <p className="hint">{t("anat.hint")}</p>
    </div>
  );
}
