/**
 * Primary actions pinned to the bottom of the viewport while a long form is on screen. Server component.
 *
 * `position: sticky` (not fixed): it sits above the tab bar (`bottom: var(--dock-offset)`) while its
 * form scrolls, and settles at the end of the form when you reach it — no spacer, no overlap with the
 * last field, no layout shift. When the keyboard is open the tab bar hides and the bar drops to the
 * bottom edge. ≥ 1024 px it becomes an ordinary right-aligned (end-aligned) actions row.
 *
 * Place it as the LAST child of the <form> (sticky is bounded by its parent). Primary action last in
 * DOM order; on phones buttons share the width.
 */
import type { CSSProperties, ReactNode } from "react";

export interface StickyActionBarProps {
  children: ReactNode;
  /** Short context line shown above the buttons on phones (e.g. "Total SAR 125,000 · 3 lines"). */
  note?: ReactNode;
  /** Cancel the parent's inline padding so the bar runs edge to edge; set to that padding (default 16px). */
  bleed?: string | false;
  className?: string;
}

export function StickyActionBar({ children, note, bleed = false, className }: StickyActionBarProps) {
  return (
    <div
      className={["m-actionbar", className].filter(Boolean).join(" ")}
      style={bleed ? ({ "--m-bleed": bleed } as CSSProperties) : undefined}
      data-bleed={bleed ? "" : undefined}
    >
      {note ? <div className="m-actionbar-note">{note}</div> : null}
      <div className="m-actionbar-btns">{children}</div>
    </div>
  );
}
