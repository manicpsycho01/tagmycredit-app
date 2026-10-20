/**
 * Phone layout matrix (lead request): runs on phone-360 / phone-390 (touch) / phone-430.
 * For every visited page, in English and Arabic: no horizontal overflow (top/middle/bottom), sticky header and
 * bottom tab bar visible, focused inputs not covered, tap targets ≥ 44 px, inputs ≥ 16 px, dialogs = bottom sheets
 * that close with Escape.
 */
import type { Page } from "@playwright/test";
import { coveredInputs, expect, overflowIssues, P, setLanguage, signIn, smallInputs, smallTapTargets, test } from "../helpers";

const PUBLIC = ["/", "/sign-in", "/register", "/demo"];
const APP: { as: string; paths: string[] }[] = [
  { as: P.sara, paths: ["/home", "/credit-given", "/lines/new", "/snapshots", "/check", "/projects", "/alerts", "/company"] },
  { as: P.omar, paths: ["/home", "/credit-received"] },
  { as: P.ops, paths: ["/ops", "/ops?tab=release", "/ops?tab=audit", "/dev/outbox"] },
];

async function barsVisible(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const h = window.innerHeight;
    window.scrollTo(0, document.documentElement.scrollHeight / 2);
    const fixed = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((el) => {
      const p = getComputedStyle(el).position;
      return (p === "fixed" || p === "sticky") && el.getBoundingClientRect().height > 0;
    });
    const header = fixed.find((el) => el.tagName === "HEADER" || el.matches("[class*=header]"));
    if (!header) out.push("no sticky/fixed header");
    else if (header.getBoundingClientRect().top < -1) out.push("header scrolled out of view");
    const tabbar = fixed.find((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom >= h - 2 && r.top > h / 2 && el.querySelectorAll("a, button").length >= 3;
    });
    if (!tabbar) out.push("no bottom tab bar (fixed element at the bottom with ≥ 3 links)");
    window.scrollTo(0, 0);
    return out;
  });
}

async function dialogIssues(page: Page): Promise<string[]> {
  const trigger = page.locator("main [aria-haspopup=dialog]:visible").first();
  if (!(await trigger.count())) return [];
  await trigger.click();
  const dlg = page.locator("dialog[open], [role=dialog]:visible").first();
  await expect(dlg).toBeVisible();
  const out: string[] = [];
  const box = await dlg.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { bottom: r.bottom, left: r.left, width: r.width, vw: window.innerWidth, vh: window.innerHeight };
  });
  if (Math.abs(box.bottom - box.vh) > 2) out.push(`dialog is not a bottom sheet (bottom ${Math.round(box.bottom)} vs viewport ${box.vh})`);
  if (box.width < box.vw - 2) out.push(`dialog not full width (${Math.round(box.width)} of ${box.vw})`);
  await page.keyboard.press("Escape");
  if (await dlg.isVisible()) out.push("dialog did not close on Escape");
  return out;
}

async function auditPage(page: Page, path: string, opts: { app: boolean }): Promise<string[]> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const issues = [
    ...(await overflowIssues(page)),
    ...(await smallTapTargets(page)).map((t) => `tap target < 44px: ${t}`),
    ...(await smallInputs(page)).map((t) => `input font < 16px: ${t}`),
    ...(opts.app ? await barsVisible(page) : []),
    ...(await coveredInputs(page)).map((t) => `focused input hidden: ${t}`),
    ...(await dialogIssues(page)),
  ];
  return issues.map((i) => `${path}: ${i}`);
}

for (const lang of ["en", "ar"] as const) {
  test.describe(`phone layout (${lang})`, () => {
    test(`public pages`, async ({ page }) => {
      await page.goto("/");
      if (lang === "ar") await setLanguage(page, "ar");
      const issues: string[] = [];
      for (const path of PUBLIC) issues.push(...(await auditPage(page, path, { app: false })));
      expect(issues).toEqual([]);
    });

    for (const { as, paths } of APP) {
      test(`app pages as ${as}`, async ({ page }) => {
        await signIn(page, as);
        if (lang === "ar") {
          await setLanguage(page, "ar");
          await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        }
        const issues: string[] = [];
        for (const path of paths) issues.push(...(await auditPage(page, path, { app: !as.startsWith("ops@") || path.startsWith("/ops") })));
        expect(issues).toEqual([]);
      });
    }
  });
}
