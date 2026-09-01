import { NextResponse } from "next/server";
import { getMcpTunnelStatus, startMcpTunnel, stopMcpTunnel } from "@/lib/mcp-tunnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getMcpTunnelStatus());
}

export async function POST() {
  return NextResponse.json(startMcpTunnel());
}

export async function DELETE() {
  return NextResponse.json(stopMcpTunnel());
}
