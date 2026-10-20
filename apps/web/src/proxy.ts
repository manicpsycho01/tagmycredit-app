/** Optimistic route protection: redirect to sign-in when no session cookie is present. Real checks run in loaders and actions. */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/sign-in", "/register", "/demo"];
const PUBLIC_PREFIXES = ["/api/auth/", "/api/cron/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|fonts/|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js|woff2?)$).*)"],
};
