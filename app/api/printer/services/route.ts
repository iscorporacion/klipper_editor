import { NextRequest, NextResponse } from "next/server";
import { getKlipperScreenService, restartPrinterService } from "@/lib/moonraker";

export async function GET() {
  try {
    return NextResponse.json({ klipperscreen: Boolean(await getKlipperScreenService()) });
  } catch {
    return NextResponse.json({ klipperscreen: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { service } = await request.json();
    if (service !== "moonraker" && service !== "klipperscreen") {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }
    await restartPrinterService(service);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to restart service" }, { status: 502 });
  }
}
