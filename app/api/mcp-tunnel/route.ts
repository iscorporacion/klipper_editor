import { NextResponse } from "next/server";
import { isCloudflaredInstalled } from "@/lib/cloudflared-status";
import { getMcpTunnelStatus, startMcpTunnel, stopMcpTunnel } from "@/lib/mcp-tunnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...getMcpTunnelStatus(), cloudflaredInstalled: await isCloudflaredInstalled() });
}

export async function POST() {
  return NextResponse.json(startMcpTunnel());
}

export async function DELETE() {
  return NextResponse.json(stopMcpTunnel());
}
