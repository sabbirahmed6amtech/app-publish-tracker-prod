import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/session";

// Open without signing in: the login page, the public status tracker, the
// client form (both reach only what their link allows), product-line logos,
// and the Store Watch cron (it brings its own key).
const PUBLIC_PATHS = [
  "/login",
  "/track",
  "/intake",
  "/uploads/logos/",
  "/api/store-watch",
  "/api/auth/signout",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Before .env is filled in there's nothing to connect to: show how to set up.
  if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) {
    if (pathname === "/setup") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
