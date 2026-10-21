"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { signIn } from "@/lib/auth-client";
import { useT } from "@/i18n/client";
import { Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/forms/FormError";

export function SignInForm({ demoMode }: { demoMode: boolean }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      try {
        const r = await signIn.email({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) });
        if (r.error) { setError(t("auth.invalid")); return; }
        router.push("/home");
        router.refresh();
      } catch { setError(t("errors.network")); }
    });
  };
  return (
    <>
      <div className="stack" style={{ gap: 6 }}><h1>{t("auth.signInTitle")}</h1><p className="muted">{t("auth.signInSub")}</p></div>
      {demoMode && <div className="demo-banner"><span>{t("auth.tryDemo")}</span><Link className="btn btn-teal btn-sm" href="/demo">{t("auth.tryDemoCta")}</Link></div>}
      <form className="form panel panel-accent" onSubmit={onSubmit}>
        <Input label={t("auth.email")} name="email" type="email" autoComplete="email" inputMode="email" required autoFocus dir="ltr" />
        <Input label={t("auth.password")} name="password" type="password" autoComplete="current-password" required dir="ltr" />
        <FormError message={error} />
        <SubmitButton pending={pending} pendingText={t("auth.signingIn")} className="btn-block">{t("auth.signIn")}</SubmitButton>
      </form>
      <p className="muted small">{t("auth.noAccount")} <Link href="/register">{t("auth.registerLink")}</Link></p>
    </>
  );
}
