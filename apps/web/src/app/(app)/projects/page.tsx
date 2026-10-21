import Link from "next/link";
import { listProjects } from "@/server/queries";
import { getT } from "@/i18n/server";
import { EmptyState, PageHead } from "@/components/ui/Basics";

export default async function ProjectsPage() {
  const [projects, t] = await Promise.all([listProjects(), getT()]);
  return (
    <>
      <PageHead title={t("projects.title")} sub={t("projects.sub")} />
      {projects.length === 0 ? <EmptyState title={t("projects.emptyTitle")} body={t("projects.emptyBody")} /> : (
        <div className="proj-cards">
          {projects.map((p) => {
            const green = Math.max(0, p.companies - p.red - p.yellow);
            return (
              <Link key={p.id} className="proj-card" href={`/projects/${p.id}`}>
                <h3>{p.name}</h3>
                <span className="loc">{p.location}</span>
                <span className="mini-map" aria-hidden="true">
                  <i style={{ flex: green, background: "var(--ok)" }} /><i style={{ flex: p.yellow, background: "var(--warn)" }} /><i style={{ flex: p.red, background: "var(--bad)" }} />
                </span>
                <span className="row small"><span>{t("projects.companies", { n: p.companies })}</span><span className="pill c-bad">{t("projects.red", { n: p.red })}</span><span className="pill c-warn">{t("projects.yellow", { n: p.yellow })}</span></span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
