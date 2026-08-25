import { NextRequest, NextResponse } from "next/server";
import { getHeaters, setHeaterTarget } from "@/lib/moonraker";

export async function GET() {
  try {
    const heaters = await getHeaters();
    return NextResponse.json({ heaters });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to query heaters" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { targets?: Record<string, number> };
    const targets = body.targets ?? {};
    const entries = Object.entries(targets);

    for (const [name, target] of entries) {
      const numericTarget = Number(target);
      if (!name || !Number.isFinite(numericTarget) || numericTarget < 0) {
        return NextResponse.json({ error: "Invalid heater target" }, { status: 400 });
      }
    }

    const results = [];
    for (const [name, target] of entries) {
      results.push(await setHeaterTarget(name, Number(target)));
    }

    const heaters = await getHeaters();
    return NextResponse.json({ results, heaters });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to set heaters" },
      { status: 502 }
    );
  }
}
