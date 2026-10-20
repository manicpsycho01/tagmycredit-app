/**
 * Page header. Server component.
 *
 * < 1024 px: a compact sticky bar (back · title · actions, fixed height = --m-header-h + safe-area top)
 * followed by a large in-flow title. When the large title scrolls under the bar, the bar's compact
 * title fades in (IntersectionObserver in <HeaderCollapse>, no scroll listeners). The bar never
 * changes height, so there is zero layout shift at any scroll position.
 * ≥ 1024 px: the bar is static and hidden; the large title row (title · subtitle · actions) is the
 * page heading under the app's desktop header.
 *
 * Must not be inside an element with `overflow` other than visible/clip, or sticky stops working.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { HeaderCollapse } from "./HeaderCollapse";
import { MobileIcon } from "./icons";

export interface MobileHeaderProps {
  title: ReactNode;
  /** Plain text for the compact bar when `title` is rich markup. */
  compactTitle?: string;
  subtitle?: ReactNode;
  /** Up-navigation. Prefer an explicit parent route over history.back() so deep links work. */
  back?: { href: string; label: string };
  /** Icon buttons / small buttons. Shown in the bar on phones and in the title row on desktop. */
  actions?: ReactNode;
  /** Optional content in the bar's leading slot when there is no back link (e.g. the logo on Home). */
  leading?: ReactNode;
  /** "teal" = brand band (default), "surface" = plain. */
  tone?: "teal" | "surface";
  /** Show the large title (default). false = single compact bar whose title is the h1. */
  large?: boolean;
  id?: string;
}

export function MobileHeader({
  title, compactTitle, subtitle, back, actions, leading, tone = "teal", large = true, id = "page-title",
}: MobileHeaderProps) {
  const lead = back ? (
    <Link href={back.href} className="m-hbtn" aria-label={back.label}>
      <MobileIcon name="back" size={24} />
    </Link>
  ) : leading ?? null;

  return (
    <>
      <div className="m-header" data-tone={tone} data-large={large || undefined} data-collapsed={large ? undefined : ""}>
        <div className="m-header-bar">
          <div className="m-header-lead">{lead}</div>
          {large ? (
            <p className="m-header-title" aria-hidden="true">{compactTitle ?? title}</p>
          ) : (
            <h1 className="m-header-title" id={id}>{title}</h1>
          )}
          <div className="m-header-actions">{actions}</div>
        </div>
      </div>
      {large ? (
        <div className="m-titlerow" data-tone={tone}>
          <div className="m-titlerow-text">
            {back ? (
              <Link href={back.href} className="m-titlerow-back link">
                <MobileIcon name="back" size={16} />
                {back.label}
              </Link>
            ) : null}
            <h1 id={id} className="m-titlerow-h1">{title}</h1>
            {subtitle ? <div className="m-titlerow-sub">{subtitle}</div> : null}
          </div>
          {actions ? <div className="m-titlerow-actions">{actions}</div> : null}
          <HeaderCollapse targetId={id} />
        </div>
      ) : subtitle ? (
        <div className="m-titlerow m-titlerow-sub-only"><div className="m-titlerow-sub">{subtitle}</div></div>
      ) : null}
    </>
  );
}
