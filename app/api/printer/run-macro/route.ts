import { NextRequest, NextResponse } from "next/server";
import { runGcodeScript } from "@/lib/moonraker";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: "Macro name is required" }, { status: 400 });
    }

    const result = await runGcodeScript(name);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to execute macro" },
      { status: 502 }
    );
  }
}
