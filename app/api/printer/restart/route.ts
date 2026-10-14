import { NextResponse } from "next/server";
import { getMoonrakerStatus, klipperRestart } from "@/lib/moonraker";
import { isRestartBlockedByPrint } from "@/lib/printer-restart";

export async function POST() {
  try {
    const status = await getMoonrakerStatus();
    if (isRestartBlockedByPrint(status)) return NextResponse.json({ error: "A print is currently active", status }, { status: 409 });
    return NextResponse.json({ result: await klipperRestart(), status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to restart Klipper" }, { status: 502 });
  }
}
