import { NextResponse } from "next/server";
import { emergencyStop } from "@/lib/moonraker";

export async function POST() {
  try {
    const result = await emergencyStop();
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run emergency stop" },
      { status: 502 }
    );
  }
}
