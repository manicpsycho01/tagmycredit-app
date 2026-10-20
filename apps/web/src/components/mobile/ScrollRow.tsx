"use client";
/**
 * Horizontal row of chips/tabs/cards: native scroll with scroll-snap, hidden scrollbar, and edge fades
 * that appear only when there is more content in that direction (RTL-aware). The current item
 * (aria-current / aria-selected="true" / aria-pressed="true" / [data-active]) is scrolled into
 * view on mount without moving the page vertically.
 *
 * Children are the items (use `.m-chip` for filter chips, or `.tabs` children). `as="ul"` + <li>
 * children for lists.
 */
import { useEffect, useRef, type ReactNode } from "react";

export interface ScrollRowProps {
  children: ReactNode;
  /** Bleed to the screen edges (cancels the 16 px page gutter) — the native look for chip rows. */
  bleed?: boolean;
  snap?: "start" | "center" | "none";
  as?: "div" | "ul";
  className?: string;
  /** If the row is a landmark-worthy group (e.g. filters), give it a name. */
  ariaLabel?: string;
}

const ACTIVE = '[aria-current]:not([aria-current="false"]),[aria-selected="true"],[aria-pressed="true"],[data-active]';

export function ScrollRow({ children, bleed = false, snap = "start", as = "div", className, ariaLabel }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement & HTMLUListElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = el.scrollWidth - el.clientWidth;
      const pos = Math.abs(el.scrollLeft); // RTL scrollLeft is ≤ 0 in all current engines
      if (max > 1) el.dataset.overflow = ""; else delete el.dataset.overflow;
      if (pos > 1) el.dataset.fadeStart = ""; else delete el.dataset.fadeStart;
      if (pos < max - 1) el.dataset.fadeEnd = ""; else delete el.dataset.fadeEnd;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

    // bring the active item into view horizontally only
    const active = el.querySelector<HTMLElement>(ACTIVE);
    if (active) {
      const a = active.getBoundingClientRect();
      const c = el.getBoundingClientRect();
      const delta = a.left + a.width / 2 - (c.left + c.width / 2);
      if (Math.abs(delta) > 1 && (a.left < c.left || a.right > c.right)) el.scrollLeft += delta;
    }
    update();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const Tag = as;
  return (
    <Tag
      ref={ref}
      className={["m-scrollrow", className].filter(Boolean).join(" ")}
      data-bleed={bleed || undefined}
      data-snap={snap}
      role={ariaLabel && as === "div" ? "group" : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </Tag>
  );
}
