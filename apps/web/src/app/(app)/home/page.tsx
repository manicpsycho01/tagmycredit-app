import Link from "next/link";
import { redirect } from "next/navigation";
import { getHome, getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import type { BookTotals } from "@/server/contracts";
import type { Translator } from "@/i18n/core";
import { Panel, EmptyState, ArrowIcon, DateText } from "@/components/ui/Basics";
import { ScoreCardView, TrafficLight, BandChip } from "@/components/score/Score";
import { companyName, formatMoneyCompact, formatPercent, formatShortDate } from "@/components/format";

function Book({ title, href, b, t }: { title: string; href: string; b: BookTotals; t: Translator }) {
  const u = b.limitHalalas ? b.outstandingHalalas / b.limitHalalas : 0;
  return (
    <Link className="book-tile" href={href}>
      <span className="pk">{title}</span>
      <span className="big num">{formatMoneyCompact(b.outstandingHalalas, t.locale)}</span>
      <span className="util" aria-hidden="true"><i className={u > 0.85 ? "bad" : u >= 0.6 ? "warn" : ""} style={{ width: `${Math.min(100, u * 100)}%` }} /></span>
      <span className="meta">
        <span>{t("home.activeLines", { n: b.activeLines })}</span>
        <span>{t("home.limit")} <b>{formatMoneyCompact(b.limitHalalas, t.locale)}</b></span>
        <span className="bad">{t("home.overdue")} <b>{formatMoneyCompact(b.overdueHalalas, t.locale)}</b></span>
        <span>{t("home.utilization", { p: formatPercent(u, t.locale) })}</span>
      </span>
    </Link>
  );
}

export default async function HomePage() {
  const session = await getSession();
  if (session && !session.company) redirect("/ops");
  const [home, t] = await Promise.all([getHome(), getT()]);
  const first = session?.user.name.split(" ")[0] ?? "";
  return (
    <div className="stack-lg">
      <div className="hero-strip band">
        <div className="stack" style={{ gap: 6 }}>
          <h1>{t("home.title", { name: first })}</h1>
          {session?.company && <p className="home-company"><b>{session.company.legalName}</b> · <span className="ltr">{session.company.tmcId}</span></p>}
          <p>{t("home.sub")}</p>
          <div className="hero-strip steps" style={{ padding: 0, marginTop: 6 }}><span>{t("home.steps")}</span></div>
        </div>
        <div className="row">
          <Link className="btn btn-amber" href="/lines/new">{t("home.tagLine")}</Link>
          <Link className="btn btn-line" href="/check">{t("home.checkBuyer")}</Link>
        </div>
      </div>
      <div className="home-grid">
        <div className="stack-lg">
          <Panel title={t("home.needsYou")} id="tasks">
            {home.tasks.length === 0 ? <EmptyState title={t("home.allClear")} body={t("home.allClearBody")} /> : (
              <ul className="tasks">
                {home.tasks.map((task, i) => (
                  <li key={i}>
                    <Link className={`task ${task.urgent ? "urgent" : ""}`} href={task.href}>
                      <span className={`ic ${task.urgent ? "" : "teal"}`} aria-hidden="true">!</span>
                      <span className="tx">
                        <b>{t.dyn(`tasks.${task.kind}`, task.params)}</b>
                        <small>{t.dyn(`taskHint.${task.kind}`)}{task.dueAt ? ` · ${t("common.dueBy", { date: formatShortDate(task.dueAt, t.locale) })}` : ""}</small>
                      </span>
                      <span className="go"><ArrowIcon /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t("home.alerts")} actions={<Link className="btn btn-ghost btn-sm" href="/alerts">{t("common.viewAll")}</Link>}>
            {home.alerts.length === 0 ? <p className="muted small">{t("home.noAlerts")}</p> : (
              <ul className="alerts-list">
                {home.alerts.slice(0, 5).map((n) => (
                  <li key={n.id} className={n.read ? "" : "unread"}>
                    <span className="dot" aria-hidden="true" />
                    <span className="msg">{n.href ? <Link href={n.href}>{t.dyn(`notifications.${n.kind}`, n.params)}</Link> : t.dyn(`notifications.${n.kind}`, n.params)}</span>
                    <span className="t"><DateText iso={n.createdAt} locale={t.locale} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <section className="stack">
            <h2>{t("home.book")}</h2>
            <div className="book-tiles">
              <Book title={t("home.given")} href="/credit-given" b={home.given} t={t} />
              <Book title={t("home.received")} href="/credit-received" b={home.received} t={t} />
            </div>
          </section>
        </div>
        <div className="stack-lg">
          <Panel title={t("home.watchlist")} kicker={t("home.watchlistSub")}>
            {home.watchlist.length === 0 ? <p className="muted small">{t("home.watchlistEmpty")}</p> : (
              <ul className="watch">
                {home.watchlist.map((w) => (
                  <li key={w.id}><Link href={`/check/${w.id}`}>
                    <span className="nm"><b>{companyName(w, t.locale)}</b><small>{formatMoneyCompact(w.outstandingHalalas, t.locale)}</small></span>
                    <TrafficLight light={w.light} t={t} small />
                    <BandChip band={w.band} score={w.score} t={t} />
                  </Link></li>
                ))}
              </ul>
            )}
          </Panel>
          {home.myScore && (
            <Panel title={t("home.myScore")} kicker={t("home.myScoreSub")}>
              <ScoreCardView card={home.myScore} t={t} own compact />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
