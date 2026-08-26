import { NextRequest, NextResponse } from "next/server";
import { closeTerminalSession, createTerminalSession, readTerminalSession } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(createTerminalSession());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start terminal" },
      { status: 403 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const cursor = Number(request.nextUrl.searchParams.get("cursor") ?? "0");

    if (!id) {
      return NextResponse.json({ error: "Missing terminal session id" }, { status: 400 });
    }

    return NextResponse.json(readTerminalSession(id, Number.isFinite(cursor) ? cursor : 0));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read terminal" },
      { status: 404 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";

  if (!id) {
    return NextResponse.json({ error: "Missing terminal session id" }, { status: 400 });
  }

  closeTerminalSession(id);
  return NextResponse.json({ ok: true });
}
