import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { apiLimiter } from "@/lib/rate-limit";

const PUBLIC_PATHS = ["/login", "/api/auth"];

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    const rl = apiLimiter.consume(clientIp(req));
    if (!rl.allowed) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      });
    }
  }

  if (isPublic(pathname)) return NextResponse.next();

  // NextAuth names the session cookie "__Secure-…" when the site runs on https. Derive it from
  // the request protocol so that it matches how the cookie was set (on Vercel and locally),
  // instead of guessing from NEXTAUTH_URL / VERCEL (a mismatch causes a login redirect loop).
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: req.nextUrl.protocol === "https:",
  });
  if (token) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
