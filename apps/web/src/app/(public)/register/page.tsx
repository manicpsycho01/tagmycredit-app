import { redirect } from "next/navigation";
import { getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { AuthFrame } from "@/components/public/AuthFrame";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Register your company" };

export default async function RegisterPage() {
  const [session, t] = await Promise.all([getSession().catch(() => null), getT()]);
  // Signed in with a company already → nothing to register. Signed in without one → resume at step 2.
  if (session?.company) redirect("/home");
  return (
    <AuthFrame t={t}>
      <RegisterForm resumeAtCompany={Boolean(session)} />
    </AuthFrame>
  );
}
