"use client";
import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { signUp } from "@/lib/auth-client";
import { registerCompany } from "@/server/actions";
import { useT } from "@/i18n/client";
import { Input, Select } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/forms/FormError";
import { TmcIdAnatomy } from "@/components/ui/TmcIdAnatomy";

const SECTORS = ["CONSTRUCTION", "BUILDING_MATERIALS", "STEEL", "CEMENT", "ELECTRICAL", "FMCG", "INDUSTRIAL", "RETAIL", "FACILITIES", "OTHER"];
const CITIES = ["Riyadh", "Jeddah", "Dammam", "Khobar", "Makkah", "Madinah", "Jubail", "Tabuk", "Abha", "Buraidah"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Three steps: account (Better Auth) → company (issues TMC-ID) → celebrate the TMC-ID. */
export function RegisterForm({ resumeAtCompany }: { resumeAtCompany: boolean }) {
  const t = useT();
  const started = useRef(Date.now());
  const [step, setStep] = useState<1 | 2 | 3>(resumeAtCompany ? 2 : 1);
  const [tmcId, setTmcId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const onAccount = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      try {
        const r = await signUp.email({ name: str(fd, "name"), email: str(fd, "email"), password: String(fd.get("password") ?? "") });
        if (r.error) { setError(r.error.code === "USER_ALREADY_EXISTS" ? t("errors.emailTaken") : t("errors.validation")); return; }
        setStep(2);
      } catch { setError(t("errors.network")); }
    });
  };

  const onCompany = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setFieldErrors({});
    start(async () => {
      const r = await registerCompany({
        legalName: str(fd, "legalName"),
        legalNameAr: str(fd, "legalNameAr") || undefined,
        crNumber: str(fd, "crNumber"),
        city: str(fd, "city"),
        sector: str(fd, "sector"),
      });
      if (!r.ok) { setError(t.dyn(r.error)); setFieldErrors(r.fieldErrors ?? {}); return; }
      setTmcId(r.data.tmcId);
      setStep(3);
    });
  };

  const fe = (k: string) => (fieldErrors[k] ? t.dyn(fieldErrors[k]) : undefined);
  const steps = [t("register.step1"), t("register.step2"), t("register.step3")];

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1>{step === 3 ? t("register.doneTitle") : t("register.title")}</h1>
        {step !== 3 && <p className="muted">{t("register.sub")}</p>}
      </div>
      <ol className="steps" aria-label={t("register.title")}>
        {steps.map((s, i) => (
          <li key={s} aria-current={i + 1 === step ? "step" : undefined} className={i + 1 < step ? "done" : undefined}>{s}</li>
        ))}
      </ol>

      {step === 1 && (
        <form className="form panel panel-accent" onSubmit={onAccount}>
          <Input label={t("auth.name")} name="name" autoComplete="name" required autoFocus />
          <Input label={t("auth.email")} name="email" type="email" autoComplete="email" inputMode="email" required dir="ltr" />
          <Input label={t("auth.password")} name="password" type="password" autoComplete="new-password" minLength={8} required dir="ltr" />
          <FormError message={error} />
          <SubmitButton pending={pending} pendingText={t("register.creating")} className="btn-block">{t("register.create")}</SubmitButton>
          <p className="muted small">{t("auth.haveAccount")} <Link href="/sign-in">{t("auth.signIn")}</Link></p>
        </form>
      )}

      {step === 2 && (
        <form className="form panel panel-accent" onSubmit={onCompany} noValidate>
          <Input label={t("register.legalName")} name="legalName" autoComplete="organization" required autoFocus error={fe("legalName")} />
          <Input label={t("register.legalNameAr")} name="legalNameAr" dir="rtl" lang="ar" error={fe("legalNameAr")} />
          <Input label={t("register.crNumber")} hint={t("register.crHint")} name="crNumber" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required dir="ltr" error={fe("crNumber")} />
          <div className="row2">
            <Select label={t("register.city")} name="city" required defaultValue="" error={fe("city")}>
              <option value="" disabled>{t("register.selectCity")}</option>
              {CITIES.map((c) => <option key={c} value={c}>{t.dyn(`city.${c}`)}</option>)}
            </Select>
            <Select label={t("register.sector")} name="sector" required defaultValue="" error={fe("sector")}>
              <option value="" disabled>{t("register.selectSector")}</option>
              {SECTORS.map((s) => <option key={s} value={s}>{t.dyn(`sector.${s}`)}</option>)}
            </Select>
          </div>
          <FormError message={error} />
          <SubmitButton pending={pending} pendingText={t("register.issuing")} className="btn-block">{t("register.issue")}</SubmitButton>
        </form>
      )}

      {step === 3 && (
        <div className="panel panel-accent stack">
          <p className="kicker">{t("register.doneKicker")}</p>
          <TmcIdAnatomy tmcId={tmcId} />
          <p className="muted small">{t("register.elapsed", { time: `${Math.max(1, Math.round((Date.now() - started.current) / 1000))}s` })}</p>
          <p>{t("register.doneBody")}</p>
          <h2 className="h3">{t("register.nextTitle")}</h2>
          <ol className="stack small">
            <li>{t("register.next1")}</li>
            <li>{t("register.next2")}</li>
            <li>{t("register.next3")}</li>
          </ol>
          <div className="cta-row">
            <Link className="btn btn-amber" href="/home">{t("register.goHome")}</Link>
            <Link className="btn btn-line" href="/company">{t("register.setupCompany")}</Link>
          </div>
        </div>
      )}
    </>
  );
}
