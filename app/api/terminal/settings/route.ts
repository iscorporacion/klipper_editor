import { NextResponse } from "next/server";
import { readAppSettings, writeAppSettings } from "@/lib/app-settings";
import { isTerminalEnabled, closeAllTerminalSessions } from "@/lib/terminal";
import { assertPtyOrigin, closePty } from "@/lib/terminal-pty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readAppSettings();
  return NextResponse.json({
    terminalEnabled: isTerminalEnabled(),
    terminalMode: settings.terminalMode ?? "basic",
    configuredTerminalEnabled: settings.terminalEnabled === true,
    envTerminalEnabled: process.env.KLIPPER_EDITOR_ENABLE_TERMINAL === "true"
  });
}

export async function PUT(request: Request) {
  try { assertPtyOrigin(request); } catch { return NextResponse.json({ error: "Invalid origin" }, { status: 403 }); }
  const body = (await request.json()) as { terminalEnabled?: unknown; terminalMode?: unknown };
  if ((body.terminalEnabled !== undefined && typeof body.terminalEnabled !== "boolean") ||
      (body.terminalMode !== undefined && body.terminalMode !== "basic" && body.terminalMode !== "pty")) {
    return NextResponse.json({ error: "Invalid terminal setting" }, { status: 400 });
  }

  const current = await readAppSettings();
  const terminalMode = body.terminalMode === "pty" || body.terminalMode === "basic" ? body.terminalMode : current.terminalMode ?? "basic";
  const terminalEnabled = typeof body.terminalEnabled === "boolean" ? body.terminalEnabled : current.terminalEnabled;
  await writeAppSettings({ ...current, terminalEnabled, terminalMode });
  if (terminalMode !== (current.terminalMode ?? "basic") || !isTerminalEnabled()) {
    closeAllTerminalSessions();
    closePty();
  }

  return NextResponse.json({
    terminalEnabled: isTerminalEnabled(),
    terminalMode,
    configuredTerminalEnabled: terminalEnabled === true,
    envTerminalEnabled: process.env.KLIPPER_EDITOR_ENABLE_TERMINAL === "true"
  });
}
