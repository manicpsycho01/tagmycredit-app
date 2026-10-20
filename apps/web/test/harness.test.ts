import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@tmc/db";

afterAll(closeDb);

describe("integration harness", () => {
  it("talks to the dedicated *_test_web database with a fixed clock", async () => {
    const r = await getDb().execute(sql`select current_database() as db`);
    expect(r.rows[0]).toEqual({ db: "tmc_test_web" });
    expect(process.env.TMC_NOW).toBe("2026-03-20T09:00:00.000Z");
  });
});
