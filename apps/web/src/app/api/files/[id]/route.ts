import { attachments, getDb, withTenant } from "@tmc/db";
import { rows } from "@tmc/db/jobs";
import { eq, sql } from "drizzle-orm";
import { getViewer } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Evidence and authority documents: bytes only for staff, or when the row is visible to the viewer's company under RLS. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return new Response("Unauthorised", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const visible =
    viewer.isStaff ||
    (viewer.company !== null &&
      (await withTenant(viewer.company.id, (tx) => rows<{ id: string }>(tx, sql`select id from attachments where id = ${id}`))).length > 0);
  if (!visible) return new Response("Not found", { status: 404 });
  const [file] = await getDb()
    .select({ fileName: attachments.fileName, mimeType: attachments.mimeType, content: attachments.content })
    .from(attachments)
    .where(eq(attachments.id, id));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
