"use client";
/**
 * Tiny client leaf for <MobileHeader>: toggles `data-collapsed` on the nearest preceding `.m-header`
 * when the large title (#targetId) passes under the sticky bar. IntersectionObserver only — no scroll
 * listeners, no layout reads on scroll.
 */
import { useEffect, useRef } from "react";

export function HeaderCollapse({ targetId }: { targetId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const target = document.getElementById(targetId);
    const row = ref.current?.closest(".m-titlerow");
    const header = row?.previousElementSibling;
    if (!target || !(header instanceof HTMLElement) || !header.classList.contains("m-header")) return;
    let io: IntersectionObserver | null = null;
    const setup = () => {
      io?.disconnect();
      const h = Math.round(header.getBoundingClientRect().height);
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          const above = !entry.isIntersecting && entry.boundingClientRect.top < h;
          if (above) header.dataset.collapsed = "";
          else delete header.dataset.collapsed;
        },
        { rootMargin: `-${h}px 0px 0px 0px`, threshold: 0 },
      );
      io.observe(target);
    };
    setup();
    // header height only changes with breakpoint / safe-area changes
    const mq = window.matchMedia("(min-width: 1024px)");
    mq.addEventListener("change", setup);
    return () => {
      io?.disconnect();
      mq.removeEventListener("change", setup);
    };
  }, [targetId]);
  return <span ref={ref} hidden />;
}
