import { NextRequest, NextResponse } from "next/server";
import { getGcodeStore, getMoonrakerStatus, assertTrayRecoveryComplete, runGcodeScript } from "@/lib/moonraker";
import { readPrinterPrompt, promptCancelsPrint, promptResumesPrint } from "@/lib/printer-prompts";

const acknowledged = new Set<string>();
const currentPrompt = async () => {
  const prompt = readPrinterPrompt(await getGcodeStore(1000));
  return prompt && !acknowledged.has(prompt.id) ? prompt : null;
};
export async function GET() {
  try { return NextResponse.json({ prompt: await currentPrompt() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read printer prompts" }, { status: 502 }); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = await currentPrompt();
    const button = prompt?.buttons.find((item) => item.command === body.command && item.label === body.label);
    if (!prompt || prompt.id !== body.id || !button) return NextResponse.json({ error: "promptChanged" }, { status: 409 });
    if (promptCancelsPrint(button) && body.confirmCancel !== true) return NextResponse.json({ error: "confirmCancel" }, { status: 409 });
    const status = await getMoonrakerStatus();
    if (status.webhooksState !== "ready") return NextResponse.json({ error: "printerNotReady" }, { status: 409 });
    if (promptResumesPrint(button)) await assertTrayRecoveryComplete();
    await runGcodeScript(button.command);
    if (prompt.kind) {
      acknowledged.add(prompt.id);
      if (acknowledged.size > 100) acknowledged.delete(acknowledged.values().next().value as string);
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to execute printer prompt" }, { status: 502 }); }
}
