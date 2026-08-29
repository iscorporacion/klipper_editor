import { NextRequest, NextResponse } from "next/server";
import { cancelPrint, pausePrint, resumePrint } from "@/lib/moonraker";

const actions = {
  pause: pausePrint,
  resume: resumePrint,
  cancel: cancelPrint
} as const;

type PrintAction = keyof typeof actions;

function isPrintAction(value: string): value is PrintAction {
  return value in actions;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string };
    const action = body.action?.trim() ?? "";

    if (!isPrintAction(action)) {
      return NextResponse.json({ error: "Invalid print action" }, { status: 400 });
    }

    const result = await actions[action]();
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to control print" },
      { status: 502 }
    );
  }
}
