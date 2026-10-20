import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  /* optional */
}
// Service integration tests use their own database (<TEST_DATABASE_URL>_web) so ticks / score releases
// never collide with the @tmc/db suite, which runs in parallel under `pnpm -r test`.
const base = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/tmc_test";
const webUrl = base.replace(/\/([^/?]+)(\?|$)/, "/$1_web$2");
process.env.WEB_TEST_DATABASE_URL = webUrl;

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL("./src/$1", import.meta.url)) },
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./test/support/empty.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/support/global-setup.ts"],
    setupFiles: ["./test/support/setup.ts"],
    env: {
      DATABASE_URL: webUrl,
      TEST_DATABASE_URL: webUrl,
      DEMO_MODE: "true",
      MESSAGING_MODE: "outbox",
      TMC_NOW: "2026-03-20T09:00:00.000Z",
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
