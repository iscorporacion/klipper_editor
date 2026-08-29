import { NextResponse } from "next/server";
import { listGcodeFiles, listPrintHistory } from "@/lib/moonraker";

export async function GET() {
  try {
    const [files, history] = await Promise.all([listGcodeFiles(), listPrintHistory()]);
    return NextResponse.json({ files, history });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load printed files" },
      { status: 502 }
    );
  }
}
