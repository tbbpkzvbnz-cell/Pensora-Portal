import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/passwort-vergessen", "/passwort-zuruecksetzen", "/erfassung", "/api/erfassung"];

/** Optimistic check only. Real authorization happens in every service call. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.has("pensora_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|pensora-logo.png).*)"],
};
