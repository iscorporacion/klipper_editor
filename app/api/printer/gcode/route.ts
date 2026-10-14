import { NextRequest, NextResponse } from "next/server";
import { assertTrayRecoveryComplete, runGcodeScript } from "@/lib/moonraker";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { script?: string };
    const script = body.script?.trim();

    if (!script) {
      return NextResponse.json({ error: "G-code script is required" }, { status: 400 });
    }

    if (/^\s*(?:RESUME|BASE_RESUME|__RESUME)\b/im.test(script)) await assertTrayRecoveryComplete();
    const result = await runGcodeScript(script);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send G-code" },
      { status: 502 }
    );
  }
}
