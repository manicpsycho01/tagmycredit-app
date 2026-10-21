import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/server/queries";
import { getT } from "@/i18n/server";
import { PageHead } from "@/components/ui/Basics";
import { SupplyChainMap } from "@/components/map/SupplyChainMap";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [map, t] = await Promise.all([getProject(projectId), getT()]);
  if (!map) notFound();
  return (
    <>
      <PageHead title={map.name} sub={t("projects.sub")} crumbs={<Link href="/projects">{t("projects.title")}</Link>} />
      <SupplyChainMap map={map} />
    </>
  );
}
