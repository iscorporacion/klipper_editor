import { NextRequest, NextResponse } from "next/server";
import { getGcodeStore } from "@/lib/moonraker";

export async function GET(request: NextRequest) {
  try {
    const count = Number(request.nextUrl.searchParams.get("count") ?? 100);
    const entries = await getGcodeStore(count);
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read G-code store" },
      { status: 502 }
    );
  }
}
