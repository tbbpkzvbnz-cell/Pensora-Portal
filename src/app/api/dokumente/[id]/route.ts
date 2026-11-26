import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/session";
import { AuthzError, NotFoundError } from "@/server/authz";
import { readDocument } from "@/server/services/documents";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/dokumente/[id]">) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const { doc, data } = await readDocument(actor, id);
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof AuthzError) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Fehler" }, { status: 500 });
  }
}
