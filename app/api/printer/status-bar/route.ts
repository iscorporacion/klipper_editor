import { NextRequest, NextResponse } from "next/server";
import { getStatusBarStatus, runGcodeScript } from "@/lib/moonraker";

const states = ["STARTUP", "STANDBY", "HOMING", "HEATING", "PRINTING", "PAUSED", "MMU", "COMPLETE", "CANCELLED", "ERROR"] as const;
const effects = new Set(["STATIC", "CYLON", "BREATHING", "BLINK", "COMET", "FIRE", "PROGRESS", "HEATER"]);
const demoEnabled = process.env.KEDITOR_WIDGET_DEMO === "true";
const demoSettings: Record<string, unknown> = { brightness: .7, automatic: 1 };
const demoDefaults: Record<string, [string, string, string, number]> = {
  startup: ["COMET", "0,120,255", "0,15,45", .7], standby: ["CYLON", "243,232,33", "30,28,2", 1], homing: ["COMET", "40,150,255", "0,15,40", .8], heating: ["HEATER", "255,35,0", "255,190,0", .7], printing: ["PROGRESS", "0,120,255", "3,3,3", 1], paused: ["BREATHING", "255,145,0", "20,5,0", 1.2], mmu: ["COMET", "170,70,255", "15,2,30", .8], complete: ["CYLON", "0,255,80", "0,25,5", 1], cancelled: ["BLINK", "255,45,20", "20,0,0", 1], error: ["BLINK", "255,0,0", "25,0,0", .45]
};
for (const [state, [effect, color, secondary, speed]] of Object.entries(demoDefaults)) Object.assign(demoSettings, { [`${state}_effect`]: effect, [`${state}_color`]: color, [`${state}_secondary`]: secondary, [`${state}_speed`]: speed });
let demoState = { state_name: "standby", effect: "CYLON", color: "243,232,33", secondary: "30,28,2", speed: 1, visible: 1 };

function demoPayload() {
  return { available: true, printing: false, state: demoState, settings: demoSettings, bedTemperature: 54, bedTarget: 70, printProgress: .43, printState: "standby", filamentColor: "#20c86a" };
}

function finite(value: unknown, min: number, max: number, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${name}`);
  return parsed;
}

function rgb(value: unknown, name: string) {
  const color = String(value ?? "").replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(color)) throw new Error(`Invalid ${name}`);
  return `${parseInt(color.slice(0, 2), 16)},${parseInt(color.slice(2, 4), 16)},${parseInt(color.slice(4, 6), 16)}`;
}

export async function GET() {
  if (demoEnabled) return NextResponse.json(demoPayload());
  try { return NextResponse.json(await getStatusBarStatus()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to query status bar" }, { status: 502 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (demoEnabled) {
      if (action === "show") demoState = { ...demoState, visible: 1 };
      else if (action === "hide" || action === "off") demoState = { ...demoState, visible: 0 };
      else if (action === "color") demoState = { ...demoState, visible: 1, state_name: "manual", effect: "STATIC", color: rgb(body.color, "color") };
      else if (action === "apply" || action === "test") {
        const key = String(body.state ?? "standby").toLowerCase();
        const config = demoDefaults[key] ?? demoDefaults.standby;
        demoState = { ...demoState, visible: 1, state_name: key, effect: String(demoSettings[`${key}_effect`] ?? config[0]), color: String(demoSettings[`${key}_color`] ?? config[1]), secondary: String(demoSettings[`${key}_secondary`] ?? config[2]), speed: Number(demoSettings[`${key}_speed`] ?? config[3]) };
      } else if (action === "restore") {
        const config = demoDefaults.standby;
        demoState = { ...demoState, visible: 1, state_name: "standby", effect: config[0], color: config[1], secondary: config[2], speed: config[3] };
      } else if (action === "configure") {
        demoSettings.brightness = Number(body.brightness); demoSettings.automatic = body.automatic === false ? 0 : 1;
        for (const state of states) { const key = state.toLowerCase(); const item = body[key] as Record<string, unknown>; demoSettings[`${key}_effect`] = item.effect; demoSettings[`${key}_color`] = rgb(item.color, "color"); demoSettings[`${key}_secondary`] = rgb(item.secondary, "secondary"); demoSettings[`${key}_speed`] = Number(item.speed); }
      }
      return NextResponse.json({ result: "demo", status: demoPayload() });
    }
    const status = await getStatusBarStatus();
    if (!status.available) return NextResponse.json({ error: "Status bar macros are not installed" }, { status: 404 });
    let script = "";
    if (action === "show") script = "STATUS_BAR_SHOW";
    else if (action === "hide") script = "STATUS_BAR_HIDE";
    else if (action === "off") script = "STATUS_BAR_OFF";
    else if (action === "restore") script = "STATUS_BAR_RESTORE";
    else if (action === "color") script = `STATUS_BAR_COLOR COLOR=${rgb(body.color, "color")}`;
    else if (action === "apply" || action === "test") {
      const state = String(body.state ?? "").toUpperCase();
      if (!states.includes(state as typeof states[number])) throw new Error("Invalid status bar state");
      if (action === "test" && body.effect) {
        const effect = String(body.effect ?? "").toUpperCase();
        if (!effects.has(effect)) throw new Error("Invalid preview effect");
        script = `STATUS_BAR_PREVIEW_STATE STATE=${state} EFFECT=${effect} COLOR=${rgb(body.color, "preview color")} SECONDARY=${rgb(body.secondary, "preview secondary")} SPEED=${finite(body.speed, 0.05, 10, "preview speed")}`;
      } else {
        script = `${action === "test" ? "STATUS_BAR_TEST_STATE" : "STATUS_BAR_APPLY_STATE"} STATE=${state}`;
      }
    } else if (action === "configure") {
      const brightness = finite(body.brightness, 0.05, 1, "brightness");
      const automatic = body.automatic === false ? 0 : 1;
      const parts = [`BRIGHTNESS=${brightness}`, `AUTOMATIC=${automatic}`];
      for (const state of states) {
        const key = state.toLowerCase();
        const value = body[key];
        if (!value || typeof value !== "object") throw new Error(`Missing ${key} settings`);
        const item = value as Record<string, unknown>;
        const effect = String(item.effect ?? "").toUpperCase();
        if (!effects.has(effect)) throw new Error(`Invalid ${key} effect`);
        parts.push(`${state}_EFFECT=${effect}`, `${state}_COLOR=${rgb(item.color, `${key} color`)}`, `${state}_SECONDARY=${rgb(item.secondary, `${key} secondary`)}`, `${state}_SPEED=${finite(item.speed, 0.05, 10, `${key} speed`)}`);
      }
      script = `STATUS_BAR_CONFIGURE ${parts.join(" ")}`;
    } else return NextResponse.json({ error: "Unsupported status bar action" }, { status: 400 });
    const result = await runGcodeScript(script);
    return NextResponse.json({ result, status: await getStatusBarStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to control status bar" }, { status: 502 });
  }
}
