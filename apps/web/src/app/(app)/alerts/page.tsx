import Link from "next/link";
import { listNotifications } from "@/server/queries";
import { getT } from "@/i18n/server";
import { DateText, EmptyState, PageHead, Panel } from "@/components/ui/Basics";
import { MarkAllRead } from "./MarkAllRead";

export default async function AlertsPage() {
  const [notes, t] = await Promise.all([listNotifications(), getT()]);
  const unread = notes.filter((n) => !n.read).length;
  return (
    <>
      <PageHead title={t("alerts.title")} sub={t("alerts.sub")} actions={unread ? <MarkAllRead /> : undefined} />
      <Panel>
        {notes.length === 0 ? <EmptyState title={t("alerts.emptyTitle")} body={t("alerts.emptyBody")} /> : (
          <ul className="alerts-list">
            {notes.map((n) => (
              <li key={n.id} className={n.read ? "" : "unread"}>
                <span className="dot" aria-hidden="true" />
                <span className="msg">{n.href ? <Link href={n.href}>{t.dyn(`notifications.${n.kind}`, n.params)}</Link> : t.dyn(`notifications.${n.kind}`, n.params)}</span>
                <span className="t"><DateText iso={n.createdAt} locale={t.locale} time /></span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
