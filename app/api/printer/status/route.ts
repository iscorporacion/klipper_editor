import { NextResponse } from "next/server";
import { getMoonrakerStatus } from "@/lib/moonraker";

export async function GET() {
  try {
    const status = await getMoonrakerStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({
      webhooksState: "unknown",
      webhooksMessage: error instanceof Error ? error.message : "Unable to query Moonraker",
      printState: "unknown",
      filename: "",
      progress: 0,
      printDetails: {
        filename: "",
        state: "unknown",
        message: "",
        progress: 0,
        filePosition: 0,
        fileSize: 0,
        printDuration: 0,
        totalDuration: 0,
        filamentUsed: 0,
        info: {},
        raw: null
      },
      printing: false,
      zTiltAvailable: false,
      homedAxes: "",
      allAxesHomed: false,
      position: {
        x: 0,
        y: 0,
        z: 0
      },
      positionLimits: {
        x: { min: 0, max: 0 },
        y: { min: 0, max: 0 },
        z: { min: 0, max: 0 }
      },
      extruders: [],
      zOffset: 0,
      error: error instanceof Error ? error.message : "Unable to query Moonraker"
    });
  }
}
