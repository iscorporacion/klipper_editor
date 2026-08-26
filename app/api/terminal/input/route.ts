import { NextRequest, NextResponse } from "next/server";
import { writeTerminalInput } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; input?: string };
    const id = body.id?.trim() ?? "";
    const input = body.input ?? "";

    if (!id) {
      return NextResponse.json({ error: "Missing terminal session id" }, { status: 400 });
    }

    return NextResponse.json(writeTerminalInput(id, input));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to write terminal input" },
      { status: 404 }
    );
  }
}
