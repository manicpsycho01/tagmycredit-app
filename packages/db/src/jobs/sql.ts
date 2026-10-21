import type { SQL } from "drizzle-orm";
import type { Executor } from "./audit";

/** A transaction runs on one connection; queries issued in parallel (Promise.all) are chained instead of overlapping. */
const txQueues = new WeakMap<object, Promise<unknown>>();

/** Run raw SQL and return typed rows. */
export async function rows<T>(ex: Executor, query: SQL): Promise<T[]> {
  if (!("rollback" in ex)) return (await ex.execute(query)).rows as T[];
  const run = (txQueues.get(ex) ?? Promise.resolve()).catch(() => undefined).then(() => ex.execute(query));
  txQueues.set(ex, run);
  return (await run).rows as T[];
}

/** Postgres bigint/numeric come back as strings from raw queries. */
export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const iso = (v: Date | string): string => new Date(v).toISOString();
export const isoOrNull = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);
