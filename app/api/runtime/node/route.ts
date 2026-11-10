import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let requiredVersion = process.versions.node;
  let channel = "LTS";
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(process.cwd(), "node-runtime.json"), "utf8")) as { version?: unknown; channel?: unknown };
    if (typeof manifest.version === "string") requiredVersion = manifest.version;
    if (typeof manifest.channel === "string") channel = manifest.channel;
  } catch { /* Development and legacy installs may not include the manifest yet. */ }

  return NextResponse.json({
    activeVersion: process.versions.node,
    requiredVersion,
    channel,
    architecture: process.arch,
    platform: process.platform,
    managed: Boolean(process.env.KLIPPER_EDITOR_RUNTIME_ROOT),
    updatePending: process.versions.node !== requiredVersion
  });
}
