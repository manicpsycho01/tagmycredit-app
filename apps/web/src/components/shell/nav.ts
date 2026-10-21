import type { SessionContext } from "@/server/contracts";
import type { MessageKey } from "@/i18n/core";
import type { MobileIconName } from "../mobile";

export interface NavItem { href: string; label: MessageKey; icon: MobileIconName; match?: string[]; badge?: number }

/** One nav model for the desktop header and the mobile tab bar (first 4 = tabs, rest = "More"). */
export function navItems(s: SessionContext, unread: number): NavItem[] {
  const items: NavItem[] = [];
  if (s.company) {
    items.push(
      { href: "/home", label: "nav.home", icon: "home" },
      { href: "/credit-given", label: "nav.given", icon: "given", match: ["/lines"] },
      { href: "/credit-received", label: "nav.received", icon: "received" },
      { href: "/check", label: "nav.check", icon: "check" },
      { href: "/projects", label: "nav.projects", icon: "projects" },
      { href: "/alerts", label: "nav.alerts", icon: "alerts", badge: unread || undefined },
      { href: "/snapshots", label: "nav.snapshots", icon: "snapshots" },
      { href: "/company", label: "nav.company", icon: "company" },
    );
  } else {
    items.push({ href: "/alerts", label: "nav.alerts", icon: "alerts", badge: unread || undefined });
  }
  if (s.isStaff) items.splice(s.company ? 4 : 0, 0, { href: "/ops", label: "nav.ops", icon: "ops" });
  if (s.demoMode) items.push({ href: "/dev/outbox", label: "nav.outbox", icon: "outbox" });
  return items;
}
