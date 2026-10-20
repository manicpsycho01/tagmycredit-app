import AxeBuilder from "@axe-core/playwright";
import { expect, P, PASSWORD, signIn, test } from "../helpers";

test.describe("public pages", () => {
  test("landing links to sign in and the demo picker", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /demo/i }).first()).toBeVisible();
  });

  test("protected pages redirect to sign-in when signed out", async ({ page }) => {
    for (const path of ["/home", "/credit-given", "/ops", "/company"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in/);
    }
  });

  test("sign-in: wrong password shows an error, right password signs in", async ({ page, allowConsoleErrors }) => {
    allowConsoleErrors(/401|Unauthorized|Invalid email or password/i);
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill(P.sara);
    await page.getByLabel(/password/i).fill("wrong-password-123");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/home/);
  });

  test("sign-in works with the keyboard only", async ({ page }) => {
    await page.goto("/sign-in");
    const email = page.getByLabel(/email/i);
    // Tab from the top of the page must reach the email field, then password, then submit.
    await page.keyboard.press("Tab");
    for (let i = 0; i < 25 && !(await email.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(email).toBeFocused();
    await page.keyboard.type(P.sara);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(/password/i)).toBeFocused();
    await page.keyboard.type(PASSWORD);
    // focus ring is visible on the focused field
    const outline = await page.getByLabel(/password/i).evaluate((el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle !== "none" || s.boxShadow !== "none";
    });
    expect(outline, "visible focus indicator on inputs").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/home/);
  });

  test("register a company end-to-end shows a TMC-ID", async ({ page }) => {
    const n = Date.now() % 1_000_000;
    const cr = `70${String(n).padStart(8, "0")}`;
    await page.goto("/register");
    // Step 1: account
    await page.getByLabel(/full name|your name|^name/i).first().fill("E2E Tester");
    await page.getByLabel(/email/i).fill(`e2e+${n}@example.test`);
    await page.getByLabel(/password/i).first().fill("E2e-Strong-Pass-2026");
    await page.getByRole("button", { name: /continue|next/i }).click();
    // Step 2: company
    await page.getByLabel(/legal name.*english|legal name/i).first().fill(`E2E Trading ${n}`);
    await page.getByLabel(/CR|commercial registration/i).fill(cr);
    const city = page.getByLabel(/city/i);
    if ((await city.evaluate((el) => el.tagName)) === "SELECT") await city.selectOption({ index: 1 });
    else await city.fill("Riyadh");
    const sector = page.getByLabel(/sector/i);
    if ((await sector.evaluate((el) => el.tagName)) === "SELECT") await sector.selectOption({ index: 1 });
    else await sector.fill("Trading");
    await page.getByRole("button", { name: /continue|next|register|create/i }).last().click();
    // Step 3: TMC-ID issued
    const id = page.getByText(/TMC-SA-\d{4}-\d{4}-\d{2}-[0-9A-Z]/).first();
    await expect(id).toBeVisible({ timeout: 30_000 });
    expect(await id.innerText()).toContain(cr.slice(-4));
  });

  test("demo persona picker lists every persona", async ({ page }) => {
    await page.goto("/demo");
    for (const name of ["Sara", "Omar", "Layla", "Faisal", "Huda", "Khalid", "Noura"]) {
      await expect(page.getByText(new RegExp(name)).first(), name).toBeVisible();
    }
  });

  test("accessibility: no serious axe violations on public pages", async ({ page }) => {
    const out: string[] = [];
    for (const path of ["/", "/sign-in", "/register", "/demo"]) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")) out.push(`${path}: ${v.id} (${v.nodes.length}) ${v.help}`);
    }
    expect(out).toEqual([]);
  });

  test("signed-in pages pass axe too", async ({ page }) => {
    await signIn(page, P.sara);
    const out: string[] = [];
    for (const path of ["/home", "/credit-given", "/check", "/company"]) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")) out.push(`${path}: ${v.id} (${v.nodes.length}) ${v.help}`);
    }
    expect(out).toEqual([]);
  });
});
