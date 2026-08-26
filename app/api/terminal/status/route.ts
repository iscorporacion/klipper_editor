import { NextResponse } from "next/server";
import { isTerminalEnabled, terminalShell } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    enabled: isTerminalEnabled(),
    shell: terminalShell()
  });
}
