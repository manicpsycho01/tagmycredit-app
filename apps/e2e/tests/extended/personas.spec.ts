/** Each demo persona lands on a home that shows its scenario (BUILD_BRIEF demo table). */
import { expect, P, signIn, test } from "../helpers";

test.describe("demo personas", () => {
  test("one-click demo sign-in from the picker", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: /Sara/ }).or(page.getByRole("link", { name: /Sara/ })).first().click();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText(/Al Noor Building Materials/).first()).toBeVisible();
  });

  test("Sara (supplier): watchlist with YELLOW and RED buyers, Barq alert, snapshots due, closure request", async ({ page }) => {
    await signIn(page, P.sara);
    const main = page.locator("main");
    await expect(main.getByText(/Barq MEP Contractors/).first()).toBeVisible();
    await expect(main.getByText(/Wadi Hanifa Builders/).first()).toBeVisible();
    await expect(main.getByText(/RED/i).first()).toBeVisible();
    await expect(main.getByText(/YELLOW/i).first()).toBeVisible();
    await expect(main.getByText(/snapshot/i).first()).toBeVisible();
    await expect(main.getByText(/closure/i).first()).toBeVisible();
    await expect(main.getByText(/reviewed default|reassess your exposure/i).first()).toBeVisible();
  });

  test("Sara's credit-given book has ~6 buyers across bands", async ({ page }) => {
    await signIn(page, P.sara);
    await page.goto("/credit-given");
    const text = await page.locator("main").innerText();
    for (const b of ["Qimma Contracting", "Wadi Hanifa Builders", "Barq MEP Contractors"]) expect(text).toContain(b);
    expect(text).toMatch(/TCL-SA-\d{7}/);
  });

  test("Omar (CFO, Qimma): one new line + one amendment awaiting confirmation; own score GOOD/EXCELLENT GREEN", async ({ page }) => {
    await signIn(page, P.omar);
    const main = page.locator("main");
    await expect(main.getByRole("link", { name: /confirm/i }).first()).toBeVisible();
    await expect(main.getByText(/amendment/i).first()).toBeVisible();
    await expect(main.getByText(/GOOD|EXCELLENT/).first()).toBeVisible();
    await expect(main.getByText(/GREEN/i).first()).toBeVisible();
  });

  test("Layla (CFO, Wadi Hanifa): FAIR / YELLOW, open dispute, default reply task", async ({ page }) => {
    await signIn(page, P.layla);
    const main = page.locator("main");
    await expect(main.getByText(/FAIR/).first()).toBeVisible();
    await expect(main.getByText(/YELLOW/i).first()).toBeVisible();
    await expect(main.getByText(/dispute/i).first()).toBeVisible();
    await expect(main.getByText(/default/i).first()).toBeVisible();
  });

  test("Faisal (CFO, Barq): POOR / RED with the 499 cap explained", async ({ page }) => {
    await signIn(page, P.faisal);
    const main = page.locator("main");
    await expect(main.getByText(/POOR/).first()).toBeVisible();
    await expect(main.getByText(/RED/i).first()).toBeVisible();
    const score = (await main.innerText()).match(/\b([3-4]\d\d)\b/);
    expect(score, "a score ≤ 499 is shown").not.toBeNull();
  });

  test("Huda (Zahra, 2 suppliers): not enough network data, no score", async ({ page }) => {
    await signIn(page, P.huda);
    const main = page.locator("main");
    await expect(main.getByText(/not enough network data/i).first()).toBeVisible();
    await expect(main.getByText(/EXCELLENT|GOOD|FAIR|POOR/)).toHaveCount(0);
  });

  test("Khalid (Murjan, unverified): TMC-ID shown, waiting for verification, CFO pending", async ({ page }) => {
    await signIn(page, P.khalid);
    const main = page.locator("main");
    await expect(main.getByText(/TMC-SA-\d{4}-\d{4}-\d{2}-[0-9A-Z]/).first()).toBeVisible();
    await expect(main.getByText(/verif/i).first()).toBeVisible();
    await expect(main.getByText(/CFO/).first()).toBeVisible();
    // unverified companies cannot create lines
    await page.goto("/lines/new");
    await expect(page.locator("main").getByText(/verif/i).first()).toBeVisible();
  });

  test("Noura (ops): verification queue with Murjan, release, audit, outbox", async ({ page }) => {
    await signIn(page, P.ops);
    await expect(page).toHaveURL(/\/ops/);
    await expect(page.locator("main").getByText(/Murjan Construction/).first()).toBeVisible();
    for (const tab of ["release", "audit"]) {
      await page.goto(`/ops?tab=${tab}`);
      await expect(page.locator("main")).not.toBeEmpty();
    }
    await page.goto("/dev/outbox");
    await expect(page.locator("main")).toContainText(/@|\+966/);
  });

  test("non-staff cannot open the ops console", async ({ page }) => {
    await signIn(page, P.sara);
    const res = await page.goto("/ops");
    const forbidden = !page.url().includes("/ops") || (res?.status() ?? 200) >= 400 || /not (allowed|authori[sz]ed)|forbidden|404/i.test(await page.locator("body").innerText());
    expect(forbidden).toBe(true);
    await expect(page.getByText(/Murjan Construction/)).toHaveCount(0);
  });
});
