import { NextRequest, NextResponse } from "next/server";
import { getMoonrakerStatus, runGcodeScript } from "@/lib/moonraker";

const commands = {
  "home-all": "G28",
  "home-x": "G28 X",
  "home-y": "G28 Y",
  "home-z": "G28 Z",
  "z-tilt": "Z_TILT_ADJUST"
} as const;

type CommandName = keyof typeof commands;

function isCommandName(value: string): value is CommandName {
  return value in commands;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { command?: string };
    const command = body.command?.trim() ?? "";

    if (!isCommandName(command)) {
      return NextResponse.json({ error: "Invalid printer command" }, { status: 400 });
    }

    const status = await getMoonrakerStatus();
    if (status.printing) {
      return NextResponse.json({ error: "A print is currently active", status }, { status: 409 });
    }

    if (command === "z-tilt" && !status.zTiltAvailable) {
      return NextResponse.json({ error: "Z tilt is not available", status }, { status: 409 });
    }

    const result = await runGcodeScript(commands[command]);
    return NextResponse.json({ result, status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run printer command" },
      { status: 502 }
    );
  }
}
