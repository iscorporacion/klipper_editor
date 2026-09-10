import { NextRequest, NextResponse } from "next/server";
import { getHeaters, getMoonrakerStatus, runGcodeScript, runPidCalibration } from "@/lib/moonraker";

type PidJob = { id: string; heater: string; state: "running" | "complete" | "error"; error?: string };
const host = globalThis as typeof globalThis & { editorPidJob?: PidJob };
const isRunning = () => host.editorPidJob?.state === "running";

export async function GET() {
  return NextResponse.json({ job: host.editorPidJob ?? null });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (isRunning()) {
      return NextResponse.json({ error: "PID calibration is already running" }, { status: 409 });
    }
    const status = await getMoonrakerStatus();
    if (status.webhooksState !== "ready" || status.printing || status.printState === "paused") {
      return NextResponse.json({ error: "PID requires a ready printer with no active print" }, { status: 409 });
    }
    if (body.action === "save") {
      if (!host.editorPidJob || host.editorPidJob.id !== body.id || host.editorPidJob.state !== "complete") {
        return NextResponse.json({ error: "No completed PID calibration to save" }, { status: 409 });
      }
      await runGcodeScript("SAVE_CONFIG");
      host.editorPidJob = undefined;
      return NextResponse.json({ saved: true });
    }
    const heaters = await getHeaters();
    const target = Number(body.target);
    if (!heaters.some((heater) => heater.name === body.heater) || !Number.isFinite(target) || target <= 0 || target > 350 || /["\r\n]/.test(body.heater)) {
      return NextResponse.json({ error: "Invalid heater or PID target" }, { status: 400 });
    }
    if (isRunning()) {
      return NextResponse.json({ error: "PID calibration is already running" }, { status: 409 });
    }
    const job: PidJob = { id: crypto.randomUUID(), heater: body.heater, state: "running" };
    host.editorPidJob = job;
    void runPidCalibration(body.heater, target)
      .then(() => { job.state = "complete"; })
      .catch((error: unknown) => {
        job.state = "error";
        job.error = error instanceof Error ? error.message : "PID calibration failed";
      });
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PID request failed" }, { status: 502 });
  }
}
