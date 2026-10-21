import "server-only";
import { canManageLines, canManageTeam } from "@tmc/domain";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { ActionResult } from "./contracts";
import { getViewer, type Member, type Viewer } from "./session";

export type { Member };

/** An expected failure: becomes `{ ok: false, error }` (an i18n key). */
export class ActionError extends Error {
  constructor(
    readonly key: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(key);
  }
}

export const fail = (key: string, fieldErrors?: Record<string, string>): never => {
  throw new ActionError(key, fieldErrors);
};

/** Validate input; Zod messages are i18n keys (anything else maps to errors.invalid). */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const res = schema.safeParse(input);
  if (res.success) return res.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const field = issue.path.join(".") || "_";
    fieldErrors[field] ??= issue.message.startsWith("errors.") ? issue.message : "errors.invalid";
  }
  return fail("errors.validation", fieldErrors);
}

const PG_UNIQUE_VIOLATION = "23505";

/** Run an action body: map expected errors, revalidate pages on success. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.key, ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}) };
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === PG_UNIQUE_VIOLATION) return { ok: false, error: "errors.conflict" };
    throw e;
  }
}

export async function requireViewer(): Promise<Viewer> {
  return (await getViewer()) ?? fail("errors.unauthenticated");
}

export async function requireMember(): Promise<Member> {
  const v = await requireViewer();
  if (!v.company || !v.role) return fail("errors.noCompany");
  return v as Member;
}

export async function requireVerifiedMember(): Promise<Member> {
  const m = await requireMember();
  if (m.company.status !== "VERIFIED") fail("errors.companyNotVerified");
  return m;
}

export async function requireLineManager(): Promise<Member> {
  const m = await requireVerifiedMember();
  if (!canManageLines(m.role)) fail("errors.forbidden");
  return m;
}

export async function requireTeamAdmin(): Promise<Member> {
  const m = await requireMember();
  if (!canManageTeam(m.role)) fail("errors.forbidden");
  return m;
}

export async function requireCfo(): Promise<Member & { cfo: NonNullable<Viewer["cfo"]> }> {
  const m = await requireVerifiedMember();
  if (!m.cfo) fail("errors.cfoOnly");
  return m as Member & { cfo: NonNullable<Viewer["cfo"]> };
}

export async function requireStaff(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isStaff) fail("errors.forbidden");
  return v;
}
