import { notifications } from "../schema";
import type { Executor } from "./audit";

type NotificationKind = (typeof notifications.$inferInsert)["kind"];

export interface NotificationEntry {
  companyId: string;
  kind: NotificationKind;
  lineId?: string | null;
  /** i18n params. Never another supplier's identity or any amount in network alerts. */
  params?: Record<string, string | number>;
  href?: string | null;
}

/** App routes used in notification and task links (docs/HANDOFF.md, Frontend). */
export const hrefs = {
  line: (lineId: string) => `/lines/${lineId}`,
  confirm: (lineId: string) => `/lines/${lineId}/confirm`,
  check: (companyId: string) => `/check/${companyId}`,
  company: "/company",
  snapshots: "/snapshots",
  alerts: "/alerts",
  ops: (tab: string) => `/ops?tab=${tab}`,
};

/** In-app alerts. Stored payload = { params, href }. */
export async function notify(tx: Executor, entries: NotificationEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await tx.insert(notifications).values(
    entries.map((e) => ({
      companyId: e.companyId,
      kind: e.kind,
      lineId: e.lineId ?? null,
      payload: { params: e.params ?? {}, href: e.href ?? null },
    })),
  );
}
