import { NextRequest, NextResponse } from "next/server";
import { getGcodeStore, getMoonrakerStatus, getTrayStatus, assertTrayRecoveryComplete, runGcodeScript } from "@/lib/moonraker";
import { readPrinterPrompt, promptCancelsPrint, promptResumesPrint } from "@/lib/printer-prompts";

const acknowledged = new Set<string>();
const acknowledge = (id: string) => {
  acknowledged.add(id);
  if (acknowledged.size > 100) acknowledged.delete(acknowledged.values().next().value as string);
};
const rawCurrentPrompt = async () => readPrinterPrompt(await getGcodeStore(1000));
const currentPrompt = async () => {
  const prompt = await rawCurrentPrompt();
  return prompt && !acknowledged.has(prompt.id) ? prompt : null;
};
export async function GET() {
  try { return NextResponse.json({ prompt: await currentPrompt() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read printer prompts" }, { status: 502 }); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.dismiss === true) {
      const prompt = await rawCurrentPrompt();
      if (!prompt || prompt.id !== body.id || !prompt.kind) return NextResponse.json({ error: "promptChanged" }, { status: 409 });
      acknowledge(prompt.id);
      return NextResponse.json({ ok: true, dismissed: true });
    }
    const prompt = await currentPrompt();
    const button = prompt?.buttons.find((item) => item.command === body.command && item.label === body.label);
    if (!prompt || prompt.id !== body.id || !button) return NextResponse.json({ error: "promptChanged" }, { status: 409 });
    if (promptCancelsPrint(button) && body.confirmCancel !== true) return NextResponse.json({ error: "confirmCancel" }, { status: 409 });
    const status = await getMoonrakerStatus();
    if (status.webhooksState !== "ready") return NextResponse.json({ error: "printerNotReady" }, { status: 409 });
    if (promptResumesPrint(button)) await assertTrayRecoveryComplete();
    if (prompt.kind === "purgeTrayNotHomed" && button.command === "PURGE_TRAY_HOME") {
      if (!status.allAxesHomed) {
        const printState = status.printState.toLowerCase();
        if (printState === "printing" || printState === "paused") {
          return NextResponse.json({ error: "trayHomeNeedsXyzDuringPrint" }, { status: 409 });
        }
        await runGcodeScript("G28");
      }
      const tray = await getTrayStatus();
      if (!Boolean(tray.state?.homed)) await runGcodeScript("PURGE_TRAY_HOME");
    } else {
      await runGcodeScript(button.command);
    }
    if (prompt.kind) acknowledge(prompt.id);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to execute printer prompt" }, { status: 502 }); }
}
