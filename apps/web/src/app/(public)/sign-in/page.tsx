import { redirect } from "next/navigation";
import { getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { AuthFrame } from "@/components/public/AuthFrame";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  const [session, t] = await Promise.all([getSession().catch(() => null), getT()]);
  if (session) redirect("/home");
  return <AuthFrame t={t}><SignInForm demoMode={process.env.DEMO_MODE === "true"} /></AuthFrame>;
}
