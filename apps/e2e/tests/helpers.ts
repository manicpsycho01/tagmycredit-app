import { test as base, expect, type Page } from "@playwright/test";

export const PASSWORD = "TagMyCredit-Demo-2026";
export const P = {
  sara: "sara@alnoor.demo",
  omar: "omar@qimma.demo",
  layla: "layla@wadi.demo",
  faisal: "faisal@barq.demo",
  huda: "huda@zahra.demo",
  khalid: "khalid@murjan.demo",
  ops: "ops@tagmycredit.demo",
} as const;

/** Console noise that is not an app error (dev-server HMR, React DevTools hint). */
const IGNORED = [/Download the React DevTools/i, /\[HMR\]/, /\[Fast Refresh\]/, /webpack-hmr/, /favicon\.ico/];

/**
 * `test` with an automatic guard: any console error or uncaught page error during the test fails it.
 * Tests that deliberately trigger an error response can call `allowConsoleErrors(/pattern/)`.
 */
export const test = base.extend<{ allowConsoleErrors: (re: RegExp) => void; consoleGuard: void }>({
  allowConsoleErrors: async ({ page }, use) => {
    const allowed: RegExp[] = [];
    (page as unknown as { __allowed: RegExp[] }).__allowed = allowed;
    await use((re) => allowed.push(re));
  },
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const allowed = () => (page as unknown as { __allowed?: RegExp[] }).__allowed ?? [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const text = `${m.text()} @ ${m.location().url}`;
        if (IGNORED.some((re) => re.test(text)) || allowed().some((re) => re.test(text))) return;
        errors.push(`console.error: ${text}`);
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      await use();
      expect(errors, `console errors on ${page.url()}`).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30_000 });
}

export async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/** Latest 6-digit code sent by SMS to anyone (dev outbox, demo mode). Reads the outbox as ops staff in a separate page. */
export async function latestOtpFromOutbox(page: Page): Promise<string> {
  const ctx = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  const ops = await ctx.newPage();
  try {
    await signIn(ops, P.ops);
    await ops.goto("/dev/outbox");
    const body = await ops.locator("main").innerText();
    const m = body.match(/\b(\d{6})\b/);
    if (!m) throw new Error(`No 6-digit code in outbox:\n${body.slice(0, 2000)}`);
    return m[1]!;
  } finally {
    await ctx.close();
  }
}

export async function setLanguage(page: Page, lang: "en" | "ar"): Promise<void> {
  const url = new URL(page.url());
  await page.context().addCookies([{ name: "tmc_locale", value: lang, domain: url.hostname, path: "/" }]);
  await page.reload();
}

/* ───────────── Mobile layout checks ───────────── */

export interface LayoutIssue {
  page: string;
  issue: string;
}

/** No horizontal overflow at top, middle and bottom scroll positions. */
export async function overflowIssues(page: Page): Promise<string[]> {
  const issues: string[] = [];
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const [label, y] of [["top", 0], ["middle", height / 2], ["bottom", height]] as const) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => {
      const vw = window.innerWidth;
      const sw = document.documentElement.scrollWidth;
      const culprits: string[] = [];
      if (sw > vw) {
        for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && (b.right > vw + 1 || b.left < -1)) {
            const st = getComputedStyle(el);
            if (st.position === "fixed" && st.visibility === "hidden") continue;
            culprits.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} [${Math.round(b.left)}→${Math.round(b.right)}]`);
            if (culprits.length >= 5) break;
          }
        }
      }
      return { vw, sw, culprits };
    });
    if (r.sw > r.vw) issues.push(`horizontal overflow at ${label}: scrollWidth ${r.sw} > ${r.vw} (${r.culprits.join(", ")})`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return issues;
}

/** Visible nav links/buttons smaller than 44×44 CSS px (WCAG 2.5.5 / Apple HIG). Inline text links inside prose are excluded. */
export async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const els = Array.from(document.querySelectorAll<HTMLElement>("nav a, nav button, header a, header button, button, [role=button], [role=tab], input[type=submit], .btn"));
    for (const el of els) {
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none") continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (el.closest("p, li.prose, .prose")) continue;
      if (b.width < 44 || b.height < 44) {
        const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
        out.push(`"${name}" ${Math.round(b.width)}×${Math.round(b.height)}`);
      }
    }
    return Array.from(new Set(out));
  });
}

/** Text-entry controls with computed font-size < 16px (iOS zooms the page on focus). */
export async function smallInputs(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea"))
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({ el, fs: parseFloat(getComputedStyle(el).fontSize) }))
      .filter(({ fs }) => fs < 16)
      .map(({ el, fs }) => `${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? el.id ?? "?"}] ${fs}px`),
  );
}

/**
 * Focus each text input in turn and check it is not hidden behind a fixed/sticky header or bottom bar,
 * and that those bars are visible.
 */
export async function coveredInputs(page: Page): Promise<string[]> {
  const inputs = page.locator("main input:visible:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), main textarea:visible, main select:visible");
  const n = Math.min(await inputs.count(), 8);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const input = inputs.nth(i);
    await input.focus();
    await page.waitForTimeout(150);
    const covered = await input.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const x = Math.min(Math.max(b.left + b.width / 2, 1), window.innerWidth - 1);
      const y = b.top + b.height / 2;
      if (y < 0 || y > window.innerHeight) return `off-screen after focus (y=${Math.round(y)})`;
      const top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !(el as HTMLInputElement).labels?.[0]?.contains(top)) {
        let n: Element | null = top;
        while (n) {
          const pos = getComputedStyle(n).position;
          if (pos === "fixed" || pos === "sticky") return `covered by ${n.tagName.toLowerCase()}.${(n as HTMLElement).className}`;
          n = n.parentElement;
        }
      }
      return null;
    });
    if (covered) out.push(`${await input.getAttribute("name")}: ${covered}`);
  }
  return out;
}
