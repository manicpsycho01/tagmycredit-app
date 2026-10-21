import "server-only";
import type { MemberRole } from "@tmc/domain";

/** Demo personas (seeded by `pnpm --filter @tmc/db seed`). */
export const DEMO_PERSONAS: { email: string; storyKey: string; role: MemberRole | "STAFF" }[] = [
  { email: "sara@alnoor.demo", storyKey: "demo.sara", role: "CREDIT_MANAGER" },
  { email: "omar@qimma.demo", storyKey: "demo.omar", role: "ADMIN" },
  { email: "layla@wadi.demo", storyKey: "demo.layla", role: "ADMIN" },
  { email: "faisal@barq.demo", storyKey: "demo.faisal", role: "ADMIN" },
  { email: "huda@zahra.demo", storyKey: "demo.huda", role: "OWNER" },
  { email: "khalid@murjan.demo", storyKey: "demo.khalid", role: "OWNER" },
  { email: "ops@tagmycredit.demo", storyKey: "demo.ops", role: "STAFF" },
];
