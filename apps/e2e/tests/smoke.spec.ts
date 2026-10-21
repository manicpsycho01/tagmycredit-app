/**
 * Demo smoke path (runs on desktop 1280 and phone 390): demo login → home → check a buyer (GREEN, RED, below floor)
 * → CFO confirms a pending line with the OTP read from the dev outbox. Every page: no console errors, no
 * horizontal overflow (top/middle/bottom).
 * Needs the seeded demo DB (`pnpm db:reset`). The OTP step consumes Qimma's pending line; re-seed to re-run it.
 */
import type { Page } from "@playwright/test";
import pg from "pg";
import { expect, latestOtpFromOutbox, overflowIssues, P, signIn, test } from "./helpers";

const db = () => new pg.Client({ connectionString: process.env.DATABASE_URL });
async function q<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = db();
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}
const company = async (name: string) => (await q<{ id: string; tmc_id: string }>("select id, tmc_id from companies where legal_name = $1", [name]))[0];

async function noOverflow(page: Page) {
  expect(await overflowIssues(page), `overflow on ${page.url()}`).toEqual([]);
}

test.describe("demo smoke path", () => {
  test("demo picker → Sara's home", async ({ page }) => {
    await page.goto("/demo");
    await noOverflow(page);
    await page.getByRole("button", { name: /Sara/ }).or(page.getByRole("link", { name: /Sara/ })).first().click();
    await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
    await expect(page.getByText(/Al Noor Building Materials/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator("main").getByText(/Barq MEP Contractors/).first()).toBeVisible(); // watchlist / alert
    await noOverflow(page);
  });

  test("check a buyer: GREEN, RED with alert, below the privacy floor", async ({ page }) => {
    const [qimma, barq, zahra] = await Promise.all([company("Qimma Contracting"), company("Barq MEP Contractors"), company("Zahra Facilities Co.")]);
    expect(qimma && barq && zahra, "seeded companies exist (run pnpm db:reset)").toBeTruthy();
    await signIn(page, P.sara);

    // Look-up by exact TMC-ID on the check page
    await page.goto("/check");
    await noOverflow(page);
    await page.getByRole("textbox").first().fill(qimma!.tmc_id);
    await page.getByRole("textbox").first().press("Enter");
    await expect(page).toHaveURL(new RegExp(`/check/${qimma!.id}`), { timeout: 20_000 });
    const card = page.locator("main");
    await expect(card.getByText(/GREEN/i).first()).toBeVisible();
    await expect(card.getByText(/GOOD|EXCELLENT/).first()).toBeVisible();
    await noOverflow(page);

    await page.goto(`/check/${barq!.id}`);
    await expect(card.getByText(/RED/i).first()).toBeVisible();
    await expect(card.getByText(/POOR/).first()).toBeVisible();
    await expect(card.getByText(/default/i).first()).toBeVisible();
    await noOverflow(page);

    await page.goto(`/check/${zahra!.id}`);
    await expect(card.getByText(/not enough network data/i).first()).toBeVisible();
    await expect(card.getByText(/\b(POOR|FAIR|GOOD|EXCELLENT)\b/)).toHaveCount(0);
    await noOverflow(page);

    // Partial ids never match (A2)
    await page.goto("/check");
    await page.getByRole("textbox").first().fill(qimma!.tmc_id.slice(0, -2));
    await page.getByRole("textbox").first().press("Enter");
    await expect(page).not.toHaveURL(new RegExp(`/check/${qimma!.id}`));
  });

  test("CFO confirms a pending line with the OTP from the dev outbox", async ({ page }, testInfo) => {
    // Desktop only: the OTP consumes the seeded pending line (phone run would find it already confirmed).
    test.skip(testInfo.project.name !== "desktop", "state-changing; covered once on desktop");
    const pending = await q<{ line_id: string; version_id: string; tcl_id: string }>(
      `select l.id line_id, v.id version_id, l.tcl_id from credit_line_versions v join credit_lines l on l.id = v.line_id
       join companies b on b.id = l.buyer_company_id
       where b.legal_name = 'Qimma Contracting' and v.status = 'PENDING' and l.status = 'PENDING' and v.expires_at > now() limit 1`,
    );
    test.skip(!pending.length, "no pending new line for Qimma — re-seed with pnpm db:reset");
    const { line_id, tcl_id } = pending[0]!;

    await signIn(page, P.omar);
    await page.goto(`/lines/${line_id}/confirm`);
    const main = page.locator("main");
    // What the CFO must see before confirming (SPEC §3)
    await expect(main.getByText(tcl_id).first()).toBeVisible();
    await expect(main.getByText(/anonymous network data/i).first()).toBeVisible();
    await noOverflow(page);

    await main.getByRole("button", { name: /send|request|get.*code/i }).first().click();
    const otp = page.locator(".otp input:not([type=hidden])").first();
    await expect(otp).toBeVisible();
    // wrong code first: an error, line stays pending
    await otp.fill("000001");
    await main.getByRole("button", { name: /^confirm/i }).first().click();
    await expect(page.getByRole("alert").first()).toBeVisible();

    const code = await latestOtpFromOutbox(page);
    await otp.fill(code);
    await main.getByRole("button", { name: /^confirm/i }).first().click();
    await expect(page.getByText(/is now active and part of the network/i).first()).toBeVisible({ timeout: 20_000 });
    const [after] = await q<{ status: string }>("select status from credit_lines where id = $1", [line_id]);
    expect(after!.status).toBe("ACTIVE");
    await noOverflow(page);
  });
});
