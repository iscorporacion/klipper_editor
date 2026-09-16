import { NextRequest, NextResponse } from "next/server";
import { getAuxiliaryControls, setAuxiliaryControl } from "@/lib/moonraker";

export async function GET() {
  try {
    const controls = await getAuxiliaryControls();
    return NextResponse.json({ controls });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to query fans and LEDs" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: unknown; value?: unknown; color?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const value = body.value === undefined ? undefined : Number(body.value);
    const color = typeof body.color === "string" ? body.color.trim() : undefined;

    if (!name || (value !== undefined && !Number.isFinite(value))) {
      return NextResponse.json({ error: "Invalid auxiliary control" }, { status: 400 });
    }

    const result = await setAuxiliaryControl(name, value, color);
    const controls = await getAuxiliaryControls();
    return NextResponse.json({ result, controls });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to set fan or LED" },
      { status: 502 }
    );
  }
}
