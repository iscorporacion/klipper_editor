import { NextRequest, NextResponse } from "next/server";
import { getMoonrakerStatus, rebootMachine, shutdownMachine } from "@/lib/moonraker";

const actions = {
  shutdown: shutdownMachine,
  reboot: rebootMachine
} as const;

type MachinePowerAction = keyof typeof actions;

function isMachinePowerAction(value: string): value is MachinePowerAction {
  return value in actions;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string };
    const action = body.action?.trim() ?? "";

    if (!isMachinePowerAction(action)) {
      return NextResponse.json({ error: "Invalid machine power action" }, { status: 400 });
    }

    const status = await getMoonrakerStatus();
    if (status.printing) {
      return NextResponse.json({ error: "A print is currently active", status }, { status: 409 });
    }

    const result = await actions[action]();
    return NextResponse.json({ result, status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run machine power action" },
      { status: 502 }
    );
  }
}
