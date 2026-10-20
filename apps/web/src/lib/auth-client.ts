/** Browser-side Better Auth client (sign-in, sign-up, sign-out). */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
