import { NextRequest, NextResponse } from "next/server";
import { uploadGcodeFile } from "@/lib/moonraker";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".gcode")) {
      return NextResponse.json({ error: "A .gcode file is required" }, { status: 400 });
    }

    const result = await uploadGcodeFile(file);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload G-code file" },
      { status: 502 }
    );
  }
}
