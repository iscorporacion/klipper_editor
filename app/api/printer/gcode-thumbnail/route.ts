import { NextRequest, NextResponse } from "next/server";
import { moonrakerFilePath } from "@/lib/moonraker";

export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get("path")?.trim();
    if (!path) {
      return NextResponse.json({ error: "Thumbnail path is required" }, { status: 400 });
    }

    const response = await fetch(moonrakerFilePath("gcodes", path), { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: `Unable to load thumbnail: ${response.status}` }, { status: response.status });
    }

    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") ?? "image/png");
    headers.set("Cache-Control", "no-store");

    return new NextResponse(response.body, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load thumbnail" },
      { status: 502 }
    );
  }
}
