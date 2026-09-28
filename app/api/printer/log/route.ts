import { NextRequest, NextResponse } from "next/server";
import { downloadPrinterLog } from "@/lib/moonraker";

const allowedLogs = new Set(["klippy.log", "moonraker.log"] as const);

export async function GET(request: NextRequest) {
  try {
    const name = request.nextUrl.searchParams.get("name");
    if (!name || !allowedLogs.has(name as "klippy.log" | "moonraker.log")) {
      return NextResponse.json({ error: "Unsupported log file" }, { status: 400 });
    }
    const content = await downloadPrinterLog(name as "klippy.log" | "moonraker.log");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to download printer log" }, { status: 502 });
  }
}
