import { NextResponse } from "next/server";
import { readAppSettings } from "@/lib/app-settings";
import { isTerminalEnabled, terminalShell } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readAppSettings();
  return NextResponse.json({
    enabled: isTerminalEnabled(),
    configuredEnabled: settings.terminalEnabled === true,
    envEnabled: process.env.KLIPPER_EDITOR_ENABLE_TERMINAL === "true",
    shell: terminalShell()
  });
}
