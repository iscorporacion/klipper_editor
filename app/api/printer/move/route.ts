import { NextRequest, NextResponse } from "next/server";
import { getMoonrakerStatus, runGcodeScript } from "@/lib/moonraker";

type MoveBody =
  | {
      action?: "jog";
      axis?: "x" | "y" | "z";
      distance?: number;
    }
  | {
      action?: "absolute";
      axis?: "x" | "y" | "z";
      position?: number;
    }
  | {
      action?: "z-offset";
      adjust?: number;
    };

const axisFeedrates = {
  x: 3000,
  y: 3000,
  z: 600
} as const;

function formatGcodeNumber(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function isMoveAxis(axis: unknown): axis is keyof typeof axisFeedrates {
  return typeof axis === "string" && axis in axisFeedrates;
}

function axisRangeError(axis: keyof typeof axisFeedrates, target: number, status: Awaited<ReturnType<typeof getMoonrakerStatus>>) {
  const limits = status.positionLimits[axis];

  if (!Number.isFinite(target)) {
    return `Invalid ${axis.toUpperCase()} position`;
  }

  if (target < limits.min || target > limits.max) {
    return `${axis.toUpperCase()} position ${formatGcodeNumber(target)} is outside ${formatGcodeNumber(limits.min)}-${formatGcodeNumber(limits.max)}`;
  }

  return "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MoveBody;
    const status = await getMoonrakerStatus();

    if (status.printing) {
      return NextResponse.json({ error: "A print is currently active", status }, { status: 409 });
    }

    if (!status.allAxesHomed) {
      return NextResponse.json({ error: "Printer must be homed before moving", status }, { status: 409 });
    }

    if (body.action === "jog") {
      const axis = body.axis;
      const distance = Number(body.distance);

      if (!isMoveAxis(axis) || !Number.isFinite(distance) || distance === 0) {
        return NextResponse.json({ error: "Invalid jog request" }, { status: 400 });
      }

      const rangeError = axisRangeError(axis, status.position[axis] + distance, status);
      if (rangeError) {
        return NextResponse.json({ error: rangeError, status }, { status: 400 });
      }

      const script = [
        "G91",
        `G1 ${axis.toUpperCase()}${formatGcodeNumber(distance)} F${axisFeedrates[axis]}`,
        "G90"
      ].join("\n");
      const result = await runGcodeScript(script);
      return NextResponse.json({ result, status: await getMoonrakerStatus() });
    }

    if (body.action === "absolute") {
      const axis = body.axis;
      const position = Number(body.position);

      if (!isMoveAxis(axis)) {
        return NextResponse.json({ error: "Invalid absolute move request" }, { status: 400 });
      }

      const rangeError = axisRangeError(axis, position, status);
      if (rangeError) {
        return NextResponse.json({ error: rangeError, status }, { status: 400 });
      }

      const result = await runGcodeScript(
        ["G90", `G1 ${axis.toUpperCase()}${formatGcodeNumber(position)} F${axisFeedrates[axis]}`].join("\n")
      );
      return NextResponse.json({ result, status: await getMoonrakerStatus() });
    }

    if (body.action === "z-offset") {
      const adjust = Number(body.adjust);

      if (!Number.isFinite(adjust) || adjust === 0) {
        return NextResponse.json({ error: "Invalid Z offset request" }, { status: 400 });
      }

      const result = await runGcodeScript(`SET_GCODE_OFFSET Z_ADJUST=${formatGcodeNumber(adjust)} MOVE=1`);
      return NextResponse.json({ result, status: await getMoonrakerStatus() });
    }

    return NextResponse.json({ error: "Invalid move action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to move printer" },
      { status: 502 }
    );
  }
}
