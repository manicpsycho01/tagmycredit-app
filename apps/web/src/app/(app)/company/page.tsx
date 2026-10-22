import { getCompanyPage, getSession } from "@/server/queries";
import { getT } from "@/i18n/server";
import { ResponsiveTable, type RTColumn } from "@/components/mobile";
import { EmptyState, PageHead, StatusPill } from "@/components/ui/Basics";
import { TmcIdAnatomy } from "@/components/ui/TmcIdAnatomy";
import { companyName, formatDate } from "@/components/format";
import type { MemberView } from "@/server/contracts";

export const metadata = { title: "Company" };

/** Profile, TMC-ID anatomy, team and CFO. */
export default async function CompanyPage() {
  const [p, session, t] = await Promise.all([getCompanyPage(), getSession(), getT()]);
  const c = p.company;
  const cols: RTColumn<MemberView>[] = [
    { key: "name", header: t("auth.name"), primary: true,
      cell: (m) => <span className="primary"><span>{m.name}{m.userId === session?.user.id ? ` · ${t("company.you")}` : ""}</span><small className="ltr">{m.email}</small></span> },
    { key: "role", header: t("company.inviteRole"),
      cell: (m) => <span className="flags"><StatusPill tone="neutral" dot={false}>{t.dyn(`role.${m.role}`)}</StatusPill>{m.isCfo && <StatusPill tone="ok">{t("role.CFO")}</StatusPill>}</span> },
    { key: "title", header: t("company.inviteTitle"), cell: (m) => m.title ?? "—" },
  ];
  const statusTone = c.status === "VERIFIED" ? "ok" : c.status === "UNVERIFIED" ? "amber" : "bad";
  return (
    <>
      <PageHead title={companyName(c, t.locale)} sub={`${t.dyn(`sector.${c.sector}`)} · ${t.dyn(`city.${c.city}`)}`}
        actions={<StatusPill tone={statusTone}>{t.dyn(`companyStatus.${c.status}`)}</StatusPill>} />
      <div className="stack-lg">
        <div className="grid-2">
          <section className="panel stack" aria-labelledby="tmc-id">
            <h2 id="tmc-id" className="h3">{t("company.idTitle")}</h2>
            <p className="muted small">{t("company.idSub")}</p>
            <TmcIdAnatomy tmcId={c.tmcId} />
          </section>
          <section className="panel stack" aria-labelledby="profile">
            <h2 id="profile" className="h3">{t("company.profile")}</h2>
            <dl className="signals">
              <div className="sig"><dt>{t("company.legalName")}</dt><dd>{c.legalName}</dd></div>
              {c.legalNameAr && <div className="sig"><dt>{t("company.legalNameAr")}</dt><dd lang="ar" dir="rtl">{c.legalNameAr}</dd></div>}
              <div className="sig"><dt>{t("register.crNumber")}</dt><dd className="ltr num">{c.crNumber}</dd></div>
              <div className="sig"><dt>{t("company.registered")}</dt><dd>{formatDate(c.createdAt, t.locale)}</dd></div>
              <div className="sig"><dt>{t("company.verified")}</dt><dd>{c.verifiedAt ? formatDate(c.verifiedAt, t.locale) : t("company.notVerifiedYet")}</dd></div>
            </dl>
          </section>
        </div>
        <section className="panel stack" aria-labelledby="cfo">
          <h2 id="cfo" className="h3">{t("company.cfo")}</h2>
          <p className="muted small">{t("company.cfoSub")}</p>
          {p.activeCfo ? (
            <p><b>{p.activeCfo.name}</b> · {p.activeCfo.title} · <span className="ltr">{p.activeCfo.mobileMasked}</span>
              {p.activeCfo.effectiveAt && <> · {t("company.cfoActiveSince", { date: formatDate(p.activeCfo.effectiveAt, t.locale) })}</>}</p>
          ) : !p.pendingCfo && <EmptyState title={t("company.noCfoTitle")} body={t("company.noCfoBody")} />}
          {p.pendingCfo && (
            <div className="stack">
              <StatusPill tone="amber">{t("company.cfoPending")}</StatusPill>
              <p>{t("company.cfoPendingBody", {
                name: p.pendingCfo.name,
                status: t.dyn(`cfoStatus.${p.pendingCfo.status}`),
                when: p.pendingCfo.effectiveAt ? t("company.cfoWhenDate", { date: formatDate(p.pendingCfo.effectiveAt, t.locale) }) : t("company.cfoWhenReview"),
              })}</p>
            </div>
          )}
        </section>
        <section className="stack" aria-labelledby="team">
          <h2 id="team" className="h3">{t("company.team")}</h2>
          <p className="muted small">{t("company.teamSub")}</p>
          <ResponsiveTable caption={t("company.team")} columns={cols} rows={p.members} rowKey={(m) => m.userId} />
        </section>
      </div>
    </>
  );
}
