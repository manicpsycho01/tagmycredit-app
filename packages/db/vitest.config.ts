import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run against TEST_DATABASE_URL (tmc_test) — never the demo DB.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  /* .env is optional in CI; TEST_DATABASE_URL may come from the environment */
}
const testUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/tmc_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    env: { DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
