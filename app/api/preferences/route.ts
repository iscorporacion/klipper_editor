import { NextResponse } from "next/server";
import { getPreferences, updatePreferences } from "@/lib/preferences-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getPreferences(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 500 }); }
}
export async function PUT(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const body = await request.text();
    if (body.length > 2000000) return NextResponse.json({ error: "Preferences too large" }, { status: 413 });
    const data = JSON.parse(body);
    if (!data.values || typeof data.values !== "object" || Array.isArray(data.values)) throw new Error("Invalid preferences");
    return NextResponse.json(await updatePreferences(data.values, data.previous ?? {}, data.migrate === true));
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 500 }); }
}
