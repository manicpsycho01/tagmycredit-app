/**
 * Fills unset environment variables from the monorepo root `.env` (local development: Next runs in apps/web, tsx
 * scripts in packages/*). Deployed environments set real variables and have no `.env`, so this is a no-op there.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

function findRootEnv(start: string): string | null {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      const file = join(dir, ".env");
      return existsSync(file) ? file : null;
    }
    if (dirname(dir) === dir) return null;
  }
}

const file = findRootEnv(process.cwd());
if (file) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
