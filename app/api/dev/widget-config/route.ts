import { NextRequest, NextResponse } from "next/server";
import { getMoonrakerStatus, klipperRestart } from "@/lib/moonraker";
import { getWidgetConfigSyncStatus, installWidgetConfig, widgetConfigSyncEnabled } from "@/lib/widget-config-sync";

function disabled() {
  return NextResponse.json({ enabled: false, error: "Remote widget configuration sync is disabled" }, { status: 404 });
}

export async function GET(request: NextRequest) {
  if (!widgetConfigSyncEnabled()) return disabled();
  try {
    return NextResponse.json(await getWidgetConfigSyncStatus(request.nextUrl.searchParams.get("widget") ?? ""));
  } catch (error) {
    return NextResponse.json({ enabled: true, error: error instanceof Error ? error.message : "Unable to inspect widget configuration" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  if (!widgetConfigSyncEnabled()) return disabled();
  try {
    const body = await request.json() as { widget?: unknown; action?: unknown };
    const widget = typeof body.widget === "string" ? body.widget : "";
    const action = typeof body.action === "string" ? body.action : "";
    const printer = await getMoonrakerStatus();
    if (printer.printing) return NextResponse.json({ error: "Widget configuration changes are disabled while printing" }, { status: 409 });
    if (action === "install") return NextResponse.json(await installWidgetConfig(widget));
    if (action === "restart") return NextResponse.json({ result: await klipperRestart() });
    return NextResponse.json({ error: "Unsupported widget configuration action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to manage widget configuration" }, { status: 502 });
  }
}
