import { NextResponse } from "next/server";
import { firmwareRestart, getMoonrakerStatus } from "@/lib/moonraker";

export async function POST() {
  try {
    const status = await getMoonrakerStatus();
    if (status.printing) {
      return NextResponse.json(
        {
          error: "A print is currently active",
          status
        },
        { status: 409 }
      );
    }

    const result = await firmwareRestart();
    return NextResponse.json({ result, status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to restart firmware" },
      { status: 502 }
    );
  }
}
