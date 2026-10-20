import { vi } from "vitest";

// Next.js runtime APIs are not available under vitest: stub cache revalidation and give services a
// controllable request context (cookies/headers) for session lookups.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
  updateTag: vi.fn(),
}));
