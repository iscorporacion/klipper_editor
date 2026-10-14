import { NextRequest, NextResponse } from "next/server";
import { getManualProbeState, runGcodeScript } from "@/lib/moonraker";

export async function GET() {
  try { return NextResponse.json(await getManualProbeState()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to query manual probe" }, { status: 502 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const state = await getManualProbeState();
    if (!state.ready || state.printing) return NextResponse.json({ error: "La calibracion no esta disponible durante una impresion o con Klipper desconectado" }, { status: 409 });
    let command: string;
    if (body.action === "start") {
      const option = state.options.find((item) => item.id === body.id);
      if (!option) return NextResponse.json({ error: "Invalid calibration" }, { status: 400 });
      if (state.active || !state.homed) return NextResponse.json({ error: "Completa HOME XYZ y termina la sondeada activa antes de iniciar" }, { status: 409 });
      command = option.command;
    } else {
      if (!state.active) return NextResponse.json({ error: "No hay una sondeada manual activa" }, { status: 409 });
      if (body.action === "accept") command = "ACCEPT";
      else if (body.action === "abort") command = "ABORT";
      else if (body.action === "test" && typeof body.step === "string" && ["--", "-", "+", "++", "0.005", "0.01", "0.05", "0.1", "1", "-0.005", "-0.01", "-0.05", "-0.1", "-1"].includes(body.step)) command = `TESTZ Z=${body.step}`;
      else return NextResponse.json({ error: "Invalid probe action" }, { status: 400 });
    }
    await runGcodeScript(command);
    return NextResponse.json(await getManualProbeState());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to calibrate Z" }, { status: 502 });
  }
}
