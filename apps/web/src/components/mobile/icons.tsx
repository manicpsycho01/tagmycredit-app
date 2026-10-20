/**
 * Minimal stroke icon set for mobile chrome (tab bar, header, sheets). 24×24, currentColor, aria-hidden.
 * Server-safe (no hooks). Directional icons carry `m-flip` so they mirror in RTL.
 */
import type { ReactNode, SVGProps } from "react";

export type MobileIconName =
  | "home" | "given" | "received" | "check" | "more" | "back" | "close" | "chevron"
  | "alerts" | "snapshots" | "projects" | "company" | "ops" | "plus" | "sun" | "moon"
  | "system" | "globe" | "signout" | "lines" | "outbox";

const P: Record<MobileIconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9M10 20v-6h4v6" />,
  // money leaving: arrow out of a tray (credit given)
  given: <><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" /><path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" /></>,
  // money arriving: arrow into a tray (credit received)
  received: <><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5" /><path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" /></>,
  check: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5M8 10.5l1.8 1.8L13.5 8.6" /></>,
  more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  back: <path d="M15 5 8 12l7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  alerts: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  snapshots: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3" /></>,
  projects: <><circle cx="12" cy="5" r="2.2" /><circle cx="5" cy="18" r="2.2" /><circle cx="19" cy="18" r="2.2" /><path d="M11 7 6 16M13 7l5 9M7.2 18h9.6" /></>,
  company: <><path d="M4 20V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15M15 10h4a1 1 0 0 1 1 1v9M2.5 20h19" /><path d="M8 8h3M8 12h3M8 16h3" /></>,
  ops: <><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  lines: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  outbox: <><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  system: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3Z" /></>,
  signout: <><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 8 6 12l4 4M6 12h9" /></>,
};

const FLIP: ReadonlySet<MobileIconName> = new Set(["back", "chevron", "signout"]);

export function MobileIcon({ name, size = 24, className, ...rest }: { name: MobileIconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      className={[FLIP.has(name) ? "m-flip" : "", className ?? ""].join(" ").trim() || undefined}
      {...rest}
    >
      {P[name]}
    </svg>
  );
}

/** The 8-point star logo mark (two squares, teal/ink + amber). */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="5" width="14" height="14" />
        <rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" stroke="var(--amber)" />
      </g>
    </svg>
  );
}

export function renderIcon(icon: MobileIconName | ReactNode, size = 24): ReactNode {
  return typeof icon === "string" ? <MobileIcon name={icon as MobileIconName} size={size} /> : icon;
}
