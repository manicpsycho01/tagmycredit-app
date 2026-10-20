import type { SQL } from "drizzle-orm";
import type { Executor } from "./audit";

/** Run raw SQL and return typed rows. */
export async function rows<T>(ex: Executor, query: SQL): Promise<T[]> {
  const res = await ex.execute(query);
  return res.rows as T[];
}

/** Postgres bigint/numeric come back as strings from raw queries. */
export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const iso = (v: Date | string): string => new Date(v).toISOString();
export const isoOrNull = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);
