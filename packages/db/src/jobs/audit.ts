import { auditEvents } from "../schema";
import type { Db, Tx } from "../index";

export type Executor = Db | Tx;

export interface AuditEntry {
  /** null = system (tick, release). */
  actor: string | null;
  companyId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  data?: Record<string, unknown>;
}

/** Append audit rows (same transaction as the change they describe). */
export async function audit(tx: Executor, entries: AuditEntry | AuditEntry[]): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;
  await tx.insert(auditEvents).values(
    list.map((e) => ({
      actorUserId: e.actor,
      companyId: e.companyId,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      data: e.data ?? {},
    })),
  );
}
