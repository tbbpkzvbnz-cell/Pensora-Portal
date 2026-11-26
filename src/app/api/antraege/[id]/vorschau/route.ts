import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/session";
import { AuthzError, NotFoundError } from "@/server/authz";
import { previewApplicationPdf } from "@/server/services/applications";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/antraege/[id]/vorschau">) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const pdf = await previewApplicationPdf(actor, id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Vollmacht_Vorschau.pdf"', "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof AuthzError) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Fehler" }, { status: 500 });
  }
}
