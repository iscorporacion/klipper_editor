import { NextRequest, NextResponse } from "next/server";
import { getMoonrakerStatus, getUpdateManagerStatus, updateAllComponents, updateComponent } from "@/lib/moonraker";

function updateError(error: unknown, fallback: string) {
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 502 });
}

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const status = await getUpdateManagerStatus(refresh);
    return NextResponse.json(status);
  } catch (error) {
    return updateError(error, "Unable to load updates");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string; name?: string; configuredType?: string };
    const status = await getMoonrakerStatus();
    if (status.printing) {
      return NextResponse.json({ error: "A print is currently active", status }, { status: 409 });
    }

    const action = body.action?.trim() ?? "";
    if (action === "full") {
      const result = await updateAllComponents();
      return NextResponse.json({ result });
    }

    if (action === "component" && body.name?.trim()) {
      const result = await updateComponent(body.name.trim(), body.configuredType?.trim());
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: "Invalid update request" }, { status: 400 });
  } catch (error) {
    return updateError(error, "Unable to run update");
  }
}
