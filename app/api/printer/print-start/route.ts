import { NextRequest, NextResponse } from "next/server";
import { getMoonrakerStatus, startPrint } from "@/lib/moonraker";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { filename?: string };
    const filename = body.filename?.trim();

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    const status = await getMoonrakerStatus();
    if (status.printing) {
      return NextResponse.json({ error: "A print is currently active", status }, { status: 409 });
    }

    const result = await startPrint(filename);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start print" },
      { status: 502 }
    );
  }
}
