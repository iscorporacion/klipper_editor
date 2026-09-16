import { NextRequest, NextResponse } from "next/server";
import { getBedMeshDump, getMoonrakerStatus, runBedMeshAction } from "@/lib/moonraker";

const writeActions = new Set(["clear", "calibrate", "load", "save-profile", "remove", "save-config"]);

export async function GET() {
  try {
    return NextResponse.json(await getBedMeshDump());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load bed mesh" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    const profile = typeof body.profile === "string" ? body.profile.trim() : "";

    if (!writeActions.has(action)) {
      return NextResponse.json({ error: "Invalid bed mesh action" }, { status: 400 });
    }

    const status = await getMoonrakerStatus();
    if (status.webhooksState !== "ready") {
      return NextResponse.json({ error: `Printer is not ready: ${status.webhooksMessage || status.webhooksState}` }, { status: 409 });
    }
    if (status.printing || status.printState === "paused") {
      return NextResponse.json({ error: "Bed mesh changes are disabled during an active print" }, { status: 409 });
    }

    const result = await runBedMeshAction(action, profile || undefined);
    return NextResponse.json({ result, mesh: await getBedMeshDump() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run bed mesh action" },
      { status: 502 }
    );
  }
}
