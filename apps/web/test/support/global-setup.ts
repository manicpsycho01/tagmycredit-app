import pg from "pg";

/** Creates (if needed), migrates and empties the web integration database. Only *_test_web databases. */
export default async function setup(): Promise<void> {
  const url = process.env.WEB_TEST_DATABASE_URL!;
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  if (!/_test_web$/.test(dbName)) throw new Error(`Refusing to use "${dbName}" for web integration tests`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  const exists = await c.query("select 1 from pg_database where datname = $1", [dbName]);
  if (!exists.rowCount) await c.query(`create database "${dbName}"`);
  await c.end();

  process.env.DATABASE_URL = url;
  const { runMigrations } = await import("../../../../packages/db/src/migrate");
  const { closeDb, getPool } = await import("@tmc/db");
  await runMigrations();
  // Start every run from an empty database (audit_events trigger blocks DELETE, TRUNCATE is fine).
  const tables = await getPool().query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (tables.rowCount) await getPool().query(`truncate ${tables.rows.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`);
  await closeDb();
}
