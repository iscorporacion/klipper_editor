import { NextRequest, NextResponse } from "next/server";
import { getSensorStates, setFilamentSensorEnabled } from "@/lib/moonraker";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: unknown; enabled?: unknown; includeEndstops?: unknown };
    if (typeof body.name !== "string" || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid filament sensor request" }, { status: 400 });
    }
    await setFilamentSensorEnabled(body.name, body.enabled);
    return NextResponse.json({ sensors: await getSensorStates(body.includeEndstops === true) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to control filament sensor" },
      { status: 502 }
    );
  }
}
