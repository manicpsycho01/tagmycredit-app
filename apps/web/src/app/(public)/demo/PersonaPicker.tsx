"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DemoPersona } from "@/server/contracts";
import { demoSignIn } from "@/server/actions";
import { useT } from "@/i18n/client";
import { FormError } from "@/components/forms/FormError";

export function PersonaPicker({ personas }: { personas: DemoPersona[] }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const go = (email: string) => {
    setBusy(email); setError(null);
    start(async () => {
      try {
        const r = await demoSignIn(email);
        if (!r.ok) { setError(t.dyn(r.error)); setBusy(null); return; }
        router.push("/home");
        router.refresh();
      } catch { setError(t("errors.network")); setBusy(null); }
    });
  };
  return (
    <>
      <FormError message={error} />
      <div className="personas">
        {personas.map((p) => {
          const initials = p.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("");
          return (
            <button key={p.email} type="button" className="persona" onClick={() => go(p.email)} disabled={!!busy} aria-busy={busy === p.email}
              aria-label={t("demo.signInAs", { name: p.name })}>
              <span className="top">
                <span className="avatar" aria-hidden="true">{initials}</span>
                <span className="nm"><b>{p.name}</b><small>{p.companyName ?? t("demo.staff")}</small></span>
              </span>
              <span className="tags">
                <span className="pill c-info no-dot">{t.dyn(`role.${p.role}`)}</span>
                {p.isCfo && <span className="pill c-amber no-dot">{t("demo.cfo")}</span>}
              </span>
              <p>{t.dyn(p.storyKey)}</p>
              <span className="go">{busy === p.email ? t("demo.signingIn") : t("demo.signInAs", { name: p.name.split(" ")[0] ?? p.name })} →</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
