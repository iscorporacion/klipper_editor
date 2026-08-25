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
      printing: false,
      zTiltAvailable: false,
      error: error instanceof Error ? error.message : "Unable to query Moonraker"
    });
  }
}
