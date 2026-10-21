import type { ReactNode } from "react";
import type { Translator } from "@/i18n/core";
import { Logo } from "../shell/AppShell";
import { LocaleButton, ThemeButton } from "../shell/ShellClient";

export function AuthFrame({ t, children, wide = false }: { t: Translator; children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth">
      <aside className="auth-side band">
        <div>
          <Logo />
          <h2>{t("auth.sideTitle")}</h2>
          <p className="lede hide-sm">{t("auth.sideBody")}</p>
        </div>
        <p className="fine hide-sm"><span>{t("landing.fine1")}</span><span>{t("landing.fine2")}</span><span>{t("landing.fine3")}</span></p>
      </aside>
      <main className="auth-main" id="main">
        <div className="auth-tools"><LocaleButton className="btn btn-line btn-sm" /><ThemeButton className="icon-btn" /></div>
        <div className="auth-card" style={wide ? { maxWidth: 1000 } : undefined}>{children}</div>
      </main>
    </div>
  );
}
