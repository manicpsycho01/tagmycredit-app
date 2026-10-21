import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession, listNotifications } from "@/server/queries";
import { getT, getTheme } from "@/i18n/server";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [notes, t, theme] = await Promise.all([listNotifications().catch(() => []), getT(), getTheme()]);
  const unread = notes.filter((n) => !n.read).length;
  return <AppShell session={session} unread={unread} theme={theme} t={t}>{children}</AppShell>;
}
