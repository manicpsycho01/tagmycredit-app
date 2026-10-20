import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// The app runs against the seeded demo DB (`pnpm db:reset`), with DEMO_MODE=true.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  /* optional */
}
const PORT = Number(process.env.E2E_PORT ?? 3000);
const FULL = process.env.E2E_FULL === "1";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/** Functional flows run on desktop + a 375 px phone; layout checks run on the phone matrix the lead asked for. */
const phone = (name: string, width: number, height: number) => ({
  name,
  testMatch: /extended\/mobile\.spec\.ts/,
  use: { ...devices["Desktop Chrome"], viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
});

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // flows share one seeded DB
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-US",
  },
  // Default run = the demo smoke path on desktop + a 390 px phone (lead: budget). E2E_FULL=1 adds the extended
  // suites (public pages, every persona, axe, phone layout matrix 360/390/430 in EN + AR).
  projects: [
    { name: "desktop", testMatch: FULL ? /smoke\.spec\.ts|extended\/(public|personas)\.spec\.ts/ : /smoke\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone-390", testMatch: FULL ? /smoke\.spec\.ts|extended\/mobile\.spec\.ts/ : /smoke\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
    ...(FULL ? [phone("phone-360", 360, 740), phone("phone-430", 430, 932)] : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.E2E_SERVER_CMD ?? "pnpm --filter @tmc/web dev",
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        url: `${baseURL}/sign-in`,
        reuseExistingServer: true,
        timeout: 240_000,
        stdout: "ignore",
        stderr: "pipe",
        env: { ...(process.env as Record<string, string>), DEMO_MODE: "true", PORT: String(PORT) },
      },
});
