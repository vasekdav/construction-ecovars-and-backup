import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { authMode } from "@/lib/auth/mode";
import { apiLimiter } from "@/lib/rate-limit";

const PUBLIC_PATHS = ["/login", "/api/auth"];

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Required server configuration; checked on every request so a misconfigured deployment explains itself. */
function missingConfig(): string[] {
  const missing: string[] = [];
  if (authMode() === "password" && !process.env.NEXTAUTH_SECRET) missing.push("NEXTAUTH_SECRET");
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  return missing;
}

function configErrorPage(missing: string[]): NextResponse {
  // Only variable names are shown, never values.
  const items = missing.map((m) => `<li><code>${m}</code></li>`).join("");
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Aplikace není nastavená</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#0f172a">
<h1 style="font-size:1.4rem">Aplikace není nastavená</h1>
<p>Chybí povinné proměnné prostředí:</p><ul>${items}</ul>
<p>Ve Vercelu: <strong>Settings → Environment Variables</strong>. <code>DATABASE_URL</code> je connection string databáze Postgres (např. z neon.tech)${missing.includes("NEXTAUTH_SECRET") ? ", <code>NEXTAUTH_SECRET</code> je libovolný dlouhý náhodný text" : ""}. Potom <strong>Deployments → Redeploy</strong>. Postup je v README.</p>
</body></html>`;
  return new NextResponse(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const missing = missingConfig();
  if (missing.length) return configErrorPage(missing);

  if (pathname.startsWith("/api/")) {
    const rl = apiLimiter.consume(clientIp(req));
    if (!rl.allowed) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      });
    }
  }

  // Open mode (ADR-039): no sign-in, every request is the shared user.
  if (authMode() === "open") return NextResponse.next();

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
