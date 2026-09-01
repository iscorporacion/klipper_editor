import { NextResponse } from "next/server";
import { readAppSettings, writeAppSettings } from "@/lib/app-settings";
import { isTerminalEnabled } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readAppSettings();
  return NextResponse.json({
    terminalEnabled: isTerminalEnabled(),
    configuredTerminalEnabled: settings.terminalEnabled === true,
    envTerminalEnabled: process.env.KLIPPER_EDITOR_ENABLE_TERMINAL === "true"
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { terminalEnabled?: unknown };
  if (typeof body.terminalEnabled !== "boolean") {
    return NextResponse.json({ error: "Invalid terminal setting" }, { status: 400 });
  }

  await writeAppSettings({ terminalEnabled: body.terminalEnabled });

  return NextResponse.json({
    terminalEnabled: isTerminalEnabled(),
    configuredTerminalEnabled: body.terminalEnabled,
    envTerminalEnabled: process.env.KLIPPER_EDITOR_ENABLE_TERMINAL === "true"
  });
}
