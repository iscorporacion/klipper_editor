import { NextRequest, NextResponse } from "next/server";
import { getSensorStates } from "@/lib/moonraker";

export async function GET(request: NextRequest) {
  try {
    const includeEndstops = request.nextUrl.searchParams.get("endstops") === "1";
    return NextResponse.json({ sensors: await getSensorStates(includeEndstops) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to query sensors" },
      { status: 502 }
    );
  }
}
