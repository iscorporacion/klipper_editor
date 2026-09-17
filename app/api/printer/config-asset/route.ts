import { NextRequest, NextResponse } from "next/server";
import { moonrakerFilePath } from "@/lib/moonraker";

export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get("path")?.trim().replace(/^\/+/, "");
    if (!path || path.includes("..") || path.includes("\\") || path.includes("\0")) {
      return NextResponse.json({ error: "Invalid configuration asset path" }, { status: 400 });
    }

    const response = await fetch(moonrakerFilePath("config", path), { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: `Unable to load configuration asset: ${response.status}` }, { status: response.status });
    }

    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") ?? "application/octet-stream");
    headers.set("Cache-Control", "private, max-age=300");
    return new NextResponse(response.body, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load configuration asset" },
      { status: 502 }
    );
  }
}
