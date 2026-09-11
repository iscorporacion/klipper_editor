import { NextResponse } from "next/server";
import { assertPtyOrigin, closePty, createPty, ptyStream, writePty } from "@/lib/terminal-pty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPtyOrigin(request);
    const text = await request.text();
    if (text.length > 32768) return NextResponse.json({ error: "Input too large" }, { status: 413 });
    const body = JSON.parse(text);
    const size = (value: unknown, fallback: number, min: number, max: number) =>
      typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
    if (body.action === "open") return NextResponse.json(await createPty(size(body.cols, 80, 20, 500), size(body.rows, 24, 5, 200)));
    if (typeof body.id !== "string" || !/^[a-f0-9]{64}$/.test(body.id)) throw new Error("Invalid PTY session.");
    if (body.action === "stream") return new Response(ptyStream(body.id, request.signal), {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" }
    });
    if (body.action === "close") closePty(body.id);
    else if (body.action === "input" && typeof body.data === "string") {
      const bytes = body.binary ? Buffer.from(body.data, "latin1") : Buffer.from(body.data, "utf8");
      writePty(body.id, { action: "input", data: bytes.toString("base64") });
    } else if (body.action === "resize") writePty(body.id, { action: "resize", cols: size(body.cols, 80, 20, 500), rows: size(body.rows, 24, 5, 200) });
    else throw new Error("Invalid PTY action.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PTY request failed" }, { status: 400 });
  }
}
