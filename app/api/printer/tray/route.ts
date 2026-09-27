import { NextRequest, NextResponse } from "next/server";
import { getTrayStatus, runGcodeScript } from "@/lib/moonraker";

const commands: Record<string, string> = {
  home: "BANDEJA_HOME",
  safe: "BANDEJA_SAFE",
  purge: "BANDEJA_TEST_PURGE",
  clean: "BANDEJA_TEST_CLEAN",
  drop: "BANDEJA_DROP",
  reset: "BANDEJA_RESET_COUNT"
};

function finite(value: unknown, minimum: number, maximum: number, name: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`Invalid ${name}`);
  return number;
}

export async function GET() {
  try {
    return NextResponse.json(await getTrayStatus());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to query purge tray" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const status = await getTrayStatus();
    if (!status.available) return NextResponse.json({ error: "Purge tray macros are not installed" }, { status: 404 });
    if (status.printing) {
      return NextResponse.json({ error: "Manual tray controls are disabled while printing" }, { status: 409 });
    }

    let script = commands[action];
    if (action === "move") {
      script = `BANDEJA_MOVE POS=${finite(body.position, 0, 50, "tray position")}`;
    } else if (action === "configure") {
      const profile = String(body.profile ?? "Custom").replace(/[^a-z0-9 _-]/gi, "").trim().slice(0, 32) || "Custom";
      const values = {
        SAFE: finite(body.safePosition, 0, 50, "safe position"),
        PURGE: finite(body.purgePosition, 0, 50, "purge position"),
        BRUSH: finite(body.brushPosition, 0, 50, "brush position"),
        DROP: finite(body.dropPosition, 0, 50, "drop position"),
        PURGE_X: finite(body.purgeX, -1000, 1000, "purge X"),
        PURGE_Y: finite(body.purgeY, -1000, 1000, "purge Y"),
        PURGE_Z: finite(body.purgeZ, -100, 1000, "purge Z"),
        BRUSH_X1: finite(body.brushX1, -1000, 1000, "brush start X"),
        BRUSH_X2: finite(body.brushX2, -1000, 1000, "brush end X"),
        BRUSH_Y: finite(body.brushY, -1000, 1000, "brush Y"),
        BRUSH_Z: finite(body.brushZ, -100, 1000, "brush Z"),
        PURGE_LENGTH: finite(body.purgeLength, 0, 500, "purge length"),
        SERVO_RECEIVE: finite(body.servoReceiveAngle, 0, 180, "servo receive angle"),
        SERVO_RELEASE: finite(body.servoReleaseAngle, 0, 180, "servo release angle"),
        SERVO_DWELL: finite(body.servoDwell, 100, 10000, "servo dwell"),
        MAX_BLOBS: finite(body.maxBlobs, 1, 10000, "bucket capacity")
      };
      script = `BANDEJA_CONFIGURE PROFILE="${profile}" ${Object.entries(values).map(([key, value]) => `${key}=${value}`).join(" ")}`;
    } else if (!script) {
      return NextResponse.json({ error: "Unsupported purge tray action" }, { status: 400 });
    }

    const result = await runGcodeScript(script);
    return NextResponse.json({ result, status: await getTrayStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to control purge tray" }, { status: 502 });
  }
}
