/** Migrates the test database once before the suite. Refuses to touch anything that is not a *_test DB. */
export default async function setup(): Promise<() => Promise<void>> {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/tmc_test";
  const dbName = new URL(url).pathname.slice(1);
  if (!/_test(_\w+)?$/.test(dbName)) throw new Error(`Refusing to run DB tests against "${dbName}" (must end with _test)`);
  process.env.DATABASE_URL = url;
  const { runMigrations } = await import("../src/migrate");
  const { closeDb } = await import("../src/index");
  await runMigrations();
  await closeDb();
  return async () => {};
}
