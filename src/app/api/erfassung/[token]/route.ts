import { NextResponse, type NextRequest } from "next/server";
import { completeCapture } from "@/server/services/applications";
import { ValidationError } from "@/server/services/users";
import { hit } from "@/server/auth/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/server/services/documents";

async function fileBuf(fd: FormData, key: string): Promise<Buffer | null> {
  const f = fd.get(key);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_UPLOAD_BYTES) throw new ValidationError("Eine Datei ist zu gross (max. 10 MB).");
  return Buffer.from(await f.arrayBuffer());
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/erfassung/[token]">) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await hit(`capture:${ip}`, 20, 3600))) return NextResponse.json({ error: "Zu viele Versuche. Bitte später erneut versuchen." }, { status: 429 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 3 * MAX_UPLOAD_BYTES + 100_000) return NextResponse.json({ error: "Die Dateien sind zu gross." }, { status: 413 });
  const { token } = await ctx.params;
  try {
    const fd = await req.formData();
    const signature = await fileBuf(fd, "signature");
    if (!signature) throw new ValidationError("Unterschrift fehlt.");
    await completeCapture(token, { idFront: await fileBuf(fd, "idFront"), idBack: await fileBuf(fd, "idBack"), signature });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("capture failed", e);
    return NextResponse.json({ error: "Die Übermittlung ist fehlgeschlagen. Bitte erneut versuchen." }, { status: 500 });
  }
}
