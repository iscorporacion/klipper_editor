import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { NextResponse } from "next/server";
import { clearMcpTunnelInstallError } from "@/lib/mcp-tunnel";
import { invalidateCloudflaredStatus } from "@/lib/cloudflared-status";

export const runtime = "nodejs";
const execute = promisify(execFile);
const host = globalThis as typeof globalThis & { cloudflaredInstalling?: boolean };

export async function POST() {
  if (process.platform !== "linux") {
    return NextResponse.json({ error: "Instala cloudflared desde K-Editor en la impresora Linux, no desde el modo local de Windows." }, { status: 400 });
  }
  if (host.cloudflaredInstalling) {
    return NextResponse.json({ error: "Ya hay una instalacion de cloudflared en curso." }, { status: 409 });
  }
  host.cloudflaredInstalling = true;
  try {
    const { stdout } = await execute("bash", [path.join(process.cwd(), "scripts/install-cloudflared.sh")], { timeout: 180000, maxBuffer: 65536 });
    const version = stdout.trim().split(/\r?\n/).at(-1) ?? "";
    if (!version.startsWith("cloudflared version")) throw new Error("No se pudo verificar cloudflared --version.");
    clearMcpTunnelInstallError();
    invalidateCloudflaredStatus();
    return NextResponse.json({ installed: true, version });
  } catch (error) {
    const failure = error as Error & { stderr?: string };
    return NextResponse.json({ installed: false, error: failure.stderr?.trim() || failure.message }, { status: 502 });
  } finally {
    host.cloudflaredInstalling = false;
  }
}
