import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionContext } from "@/server/contracts";
import type { Translator } from "@/i18n/core";
import { companyName } from "../format";
import { WarnIcon } from "../ui/Basics";
import { MobileIcon } from "../mobile";
import { navItems } from "./nav";
import { DesktopNav, LocaleButton, ShellTabBar, ThemeButton, UserMenu } from "./ShellClient";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link className="logo" href={href} aria-label="TagMyCredit">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="5" width="14" height="14" /><rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" stroke="#E9A23B" /></g></svg>
      <span>tagmy<b>credit</b></span>
    </Link>
  );
}

export function AppShell({ session, unread, theme, t, children }: { session: SessionContext; unread: number; theme: "light" | "dark" | null; t: Translator; children: ReactNode }) {
  const items = navItems(session, unread);
  const c = session.company;
  const roleText = session.isStaff && !c ? t("role.STAFF") : [session.role ? t(`role.${session.role}`) : null, session.isCfo ? t("role.CFO") : null].filter(Boolean).join(" · ");
  const sub = c ? `${companyName(c, t.locale)} · ${roleText}` : roleText;
  const statusTone = c?.status === "VERIFIED" ? "ok" : c?.status === "SUSPENDED" ? "bad" : "warn";
  return (
    <>
      <a className="skip" href="#main">{t("common.skipToContent")}</a>
      <header className="app-header band">
        <div className="wrap bar">
          <Logo href={c ? "/home" : "/ops"} />
          {c && (
            <div className="co-id">
              <strong>{companyName(c, t.locale)}</strong>
              <span><span className="ltr">{c.tmcId}</span><span className={`st ${statusTone}`}>{t(`companyStatus.${c.status}`)}</span></span>
            </div>
          )}
          <div className="hdr-tools">
            {c && (
              <Link href="/alerts" className="icon-btn" aria-label={unread ? t("ui.notificationsUnread", { n: unread }) : t("ui.notifications")}>
                <MobileIcon name="alerts" />{unread > 0 && <span className="badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
              </Link>
            )}
            <span className="hdr-desktop row" style={{ gap: 8 }}>
              <LocaleButton />
              <ThemeButton />
              <UserMenu name={session.user.name} email={session.user.email} sub={sub} />
            </span>
          </div>
        </div>
        <DesktopNav items={items} />
      </header>
      {c && c.status !== "VERIFIED" && (
        <div className={`banner ${c.status === "SUSPENDED" ? "bad" : ""}`} role="status">
          <div className="wrap">
            <WarnIcon />
            <p>
              <b>{c.status === "SUSPENDED" ? t("banner.suspendedTitle") : t("banner.unverifiedTitle")}</b>{" "}
              {c.status === "SUSPENDED" ? t("banner.suspendedBody") : <>{t("banner.unverifiedBody")}</>}
            </p>
          </div>
        </div>
      )}
      <main id="main" className="app-main wrap" tabIndex={-1}>{children}</main>
      <ShellTabBar items={items} theme={theme} account={{ name: session.user.name, sub }} />
    </>
  );
}
