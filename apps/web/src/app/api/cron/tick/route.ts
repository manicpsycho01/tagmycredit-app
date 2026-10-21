import { timingSafeEqual } from "node:crypto";
import { getDb } from "@tmc/db";
import { runTick } from "@tmc/db/jobs";
import { now } from "@/server/clock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request): Promise<Response> {
  if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await runTick(getDb(), now()));
}

export const GET = handle;
export const POST = handle;
