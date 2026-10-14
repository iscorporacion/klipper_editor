import { NextRequest, NextResponse } from "next/server";
import { assertTrayRecoveryComplete, getRegisteredMacros, runGcodeScript } from "@/lib/moonraker";
import { parseMacroCommand } from "@/lib/macro-widgets";

export async function GET() {
  try { return NextResponse.json({ macros: await getRegisteredMacros() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to query macros" }, { status: 502 }); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let command: ReturnType<typeof parseMacroCommand>;
    try { command = parseMacroCommand(body.command); }
    catch (error) { return NextResponse.json({ error: String((error as Error).message) }, { status: 400 }); }
    const macros = await getRegisteredMacros();
    if (!macros.includes(command.name)) return NextResponse.json({ error: `Macro not registered in Klipper: ${command.name}` }, { status: 409 });
    if (body.validateOnly === true) return NextResponse.json({ valid: true, name: command.name });
    if (["RESUME", "BASE_RESUME", "__RESUME"].includes(command.name)) await assertTrayRecoveryComplete();
    return NextResponse.json({ result: await runGcodeScript(command.script) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to execute macro" }, { status: 502 }); }
}
