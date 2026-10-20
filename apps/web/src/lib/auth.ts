/** Better Auth: email + password accounts and sessions, stored in our Postgres (DECISIONS S2). */
import { getDb, memberships, schema } from "@tmc/db";
import { now } from "@tmc/db/clock";
import { audit } from "@tmc/db/jobs";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { nextCookies } from "better-auth/next-js";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

/** Identifier prefix of company invitations in Better Auth's `verification` table. */
export const INVITE_PREFIX = "invite:";
export interface InvitePayload {
  companyId: string;
  role: "OWNER" | "ADMIN" | "CREDIT_MANAGER" | "VIEWER";
  title: string | null;
  invitedBy: string;
}

/** On sign-up, an open invitation for the email makes the new user a member of the inviting company. */
async function acceptInvite(user: { id: string; email: string }): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [invite] = await tx
      .delete(schema.verification)
      .where(and(eq(schema.verification.identifier, `${INVITE_PREFIX}${user.email.toLowerCase()}`), gt(schema.verification.expiresAt, now())))
      .returning();
    if (!invite) return;
    const payload = JSON.parse(invite.value) as InvitePayload;
    await tx.insert(memberships).values({ companyId: payload.companyId, userId: user.id, role: payload.role, title: payload.title }).onConflictDoNothing();
    await audit(tx, { actor: user.id, companyId: payload.companyId, entityType: "membership", entityId: user.id, action: "member.joined", data: { role: payload.role, invitedBy: payload.invitedBy } });
  });
}

/**
 * Demo personas sign in without a password (DEMO_MODE only). Server-only endpoint: callable through
 * `auth.api.demoSignIn` from the server action, never over HTTP.
 */
const demoSignInPlugin = () =>
  ({
    id: "tmc-demo-sign-in",
    endpoints: {
      demoSignIn: createAuthEndpoint(
        "/demo/sign-in",
        { method: "POST", body: z.object({ email: z.email() }), metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          if (process.env.DEMO_MODE !== "true") throw new APIError("FORBIDDEN", { message: "Demo mode is off" });
          const found = await ctx.context.internalAdapter.findUserByEmail(ctx.body.email.toLowerCase());
          if (!found) throw new APIError("NOT_FOUND", { message: "Unknown demo user" });
          const session = await ctx.context.internalAdapter.createSession(found.user.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not create session" });
          await setSessionCookie(ctx, { session, user: found.user });
          return ctx.json({ ok: true });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

export const auth = betterAuth({
  appName: "TagMyCredit",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
  session: { cookieCache: { enabled: false } },
  databaseHooks: { user: { create: { after: async (user) => acceptInvite(user) } } },
  // nextCookies must stay last so cookies set by other plugins reach Next's cookie store.
  plugins: [demoSignInPlugin(), nextCookies()],
});

