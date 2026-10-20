import "./env";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle; same query API as Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { tmcPool?: pg.Pool; tmcDb?: Db };

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/** Shared pool (reused across hot reloads in dev). */
export function getPool(): pg.Pool {
  if (!globalForDb.tmcPool) {
    globalForDb.tmcPool = new pg.Pool({ connectionString: databaseUrl(), max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  }
  return globalForDb.tmcPool;
}

/**
 * Owner connection: writes (after service-level authorisation), ops, auth and background jobs.
 * Bypasses row-level security as the table owner — never use it to render a company's data.
 */
export function getDb(): Db {
  if (!globalForDb.tmcDb) globalForDb.tmcDb = drizzle(getPool(), { schema });
  return globalForDb.tmcDb;
}

/**
 * Run read queries as a company: inside one transaction, switch to the restricted `tmc_app` role and set
 * the viewer company, so Postgres row-level security decides what is visible (DECISIONS A4).
 */
export async function withTenant<T>(companyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
    await tx.execute(sql`set local role tmc_app`);
    return fn(tx);
  });
}

export async function closeDb(): Promise<void> {
  await globalForDb.tmcPool?.end();
  globalForDb.tmcPool = undefined;
  globalForDb.tmcDb = undefined;
}
