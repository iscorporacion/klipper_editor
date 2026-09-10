import { NextRequest, NextResponse } from "next/server";
import { deleteGcodeFile } from "@/lib/moonraker";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { filename?: string };
    const filename = body.filename?.trim();

    if (!filename || !filename.toLowerCase().endsWith(".gcode")) {
      return NextResponse.json({ error: "A .gcode filename is required" }, { status: 400 });
    }

    const result = await deleteGcodeFile(filename);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete G-code file" },
      { status: 502 }
    );
  }
}
