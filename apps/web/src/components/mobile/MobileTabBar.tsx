"use client";
/**
 * Bottom tab bar for phones/tablets (< 1024 px; hidden by CSS above). Up to 4 destinations + "More",
 * which opens <MoreMenu>. Fixed to the bottom with the safe-area inset; slides away while the
 * on-screen keyboard is open (see useKeyboardOpen). RTL comes for free (flex follows `dir`).
 *
 * Its presence sets the CSS variables `--tabbar-space` / `--dock-offset` on <html> (via :has in
 * mobile.css), so page padding, toasts and <StickyActionBar> stay clear of it without any JS.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MoreMenu, isPathActive, type MoreMenuProps } from "./MoreMenu";
import { renderIcon, MobileIcon } from "./icons";
import type { MoreMenuItem } from "./MoreMenu";
import { useKeyboardOpen } from "./useKeyboardOpen";

export type TabItem = MoreMenuItem;

export interface MobileTabBarProps {
  /** Accessible name of the nav landmark, e.g. t("nav.main"). */
  ariaLabel: string;
  /** Up to 4 primary destinations (Home, Given, Received, Check). Extra items are ignored. */
  items: TabItem[];
  /** The 5th tab. Its sheet lists `more.items`; the tab shows as current when one of them is. */
  more: { label: string; badge?: number; badgeLabel?: string } & Omit<MoreMenuProps, "open" | "onClose">;
}

export function MobileTabBar({ ariaLabel, items, more }: MobileTabBarProps) {
  useKeyboardOpen();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const { label: moreLabel, badge: moreBadge, badgeLabel: moreBadgeLabel, ...menu } = more;
  const tabs = items.slice(0, 4);
  const moreCurrent = !tabs.some((t) => isPathActive(pathname, t.href, t.match))
    && menu.items.some((t) => isPathActive(pathname, t.href, t.match));

  return (
    <>
      <nav className="m-tabbar" aria-label={ariaLabel}>
        <ul>
          {tabs.map((t) => {
            const current = isPathActive(pathname, t.href, t.match);
            return (
              <li key={t.href}>
                <Link href={t.href} className="m-tab" aria-current={current ? "page" : undefined} prefetch>
                  <span className="m-tab-ic">
                    {renderIcon(t.icon, 24)}
                    {t.badge ? <span className="m-tab-badge" aria-hidden="true">{t.badge > 99 ? "99+" : t.badge}</span> : null}
                  </span>
                  <span className="m-tab-label">{t.label}</span>
                  {t.badge && t.badgeLabel ? <span className="sr">{t.badgeLabel}</span> : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button" className="m-tab" aria-haspopup="dialog" aria-expanded={open}
              data-current={moreCurrent || undefined} onClick={() => setOpen(true)}
            >
              <span className="m-tab-ic">
                <MobileIcon name="more" size={24} />
                {moreBadge ? <span className="m-tab-badge" aria-hidden="true">{moreBadge > 99 ? "99+" : moreBadge}</span> : null}
              </span>
              <span className="m-tab-label">{moreLabel}</span>
              {moreBadge && moreBadgeLabel ? <span className="sr">{moreBadgeLabel}</span> : null}
            </button>
          </li>
        </ul>
      </nav>
      <MoreMenu {...menu} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
