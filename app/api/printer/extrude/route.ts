import { NextRequest, NextResponse } from "next/server";
import { extrudeFilament, getMoonrakerStatus } from "@/lib/moonraker";

function isSafeExtruderName(value: unknown): value is string {
  return typeof value === "string" && /^extruder\d*$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { extruder?: string; distance?: number; speed?: number };
    const extruder = body.extruder;
    const distance = Number(body.distance);
    const speed = Number(body.speed);
    const status = await getMoonrakerStatus();

    if (status.printing) {
      return NextResponse.json({ error: "A print is currently active", status }, { status: 409 });
    }

    if (!isSafeExtruderName(extruder)) {
      return NextResponse.json({ error: "Invalid extrusion request" }, { status: 400 });
    }

    if (
      !status.extruders.some((availableExtruder) => availableExtruder.name === extruder) ||
      !Number.isFinite(distance) ||
      distance === 0 ||
      Math.abs(distance) > 200 ||
      !Number.isFinite(speed) ||
      speed <= 0 ||
      speed > 100
    ) {
      return NextResponse.json({ error: "Invalid extrusion request" }, { status: 400 });
    }

    const result = await extrudeFilament(extruder, distance, speed);
    return NextResponse.json({ result, status: await getMoonrakerStatus() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to extrude filament" },
      { status: 502 }
    );
  }
}
