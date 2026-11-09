import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends a browser that opened a production deployment's own `*.vercel.app` address (the
 * "Visit" link on a deployment in Vercel's dashboard) to the stable production address.
 *
 * Why: every deployment gets a random hostname, and Chrome's Safe Browsing flagged one of them
 * "Dangerous" — random `vercel.app` subdomains showing a sign-in form look like phishing to it.
 * A member working on that host also gets session cookies and hosted sign-in returns bound to it.
 * One stable host avoids both.
 *
 * Only page loads (GET/HEAD) outside `/api` are redirected: webhooks, the scheduler and every API
 * call keep working on whatever host they were sent to. Preview and `dev` deployments
 * (`VERCEL_ENV` other than `production`) are never touched, nor is a custom domain.
 */
export function middleware(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") return NextResponse.next();
  const canonical = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!canonical) return NextResponse.next();
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  const host = request.headers.get("host") ?? "";
  if (host === canonical || !host.endsWith(".vercel.app")) return NextResponse.next();

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${canonical}`);
  return NextResponse.redirect(target, 308);
}

export const config = {
  // Pages only: not the API, not Next's own assets, not files with an extension.
  matcher: ["/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
