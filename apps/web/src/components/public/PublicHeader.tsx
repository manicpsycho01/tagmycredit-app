import Link from "next/link";
import type { Translator } from "@/i18n/core";
import { Logo } from "../shell/AppShell";
import { LocaleButton, ThemeButton } from "../shell/ShellClient";

export function PublicHeader({ t, signedIn, demoMode }: { t: Translator; signedIn: boolean; demoMode: boolean }) {
  return (
    <header className="app-header band pub-header">
      <div className="wrap bar">
        <Logo />
        <div className="hdr-tools">
          <LocaleButton />
          <ThemeButton />
          {signedIn ? <Link className="btn btn-amber btn-sm" href="/home">{t("landing.ctaOpenApp")}</Link>
            : <>{demoMode && <Link className="btn btn-line btn-sm hide-xs" href="/demo">{t("landing.ctaDemo")}</Link>}<Link className="btn btn-amber btn-sm" href="/sign-in">{t("landing.ctaSignIn")}</Link></>}
        </div>
      </div>
    </header>
  );
}
