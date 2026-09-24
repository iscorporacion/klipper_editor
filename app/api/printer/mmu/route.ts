import { NextRequest, NextResponse } from "next/server";
import { getMmuStatus, runGcodeScript } from "@/lib/moonraker";

type GateMapEntry = { gate?: unknown; name?: unknown; material?: unknown; vendor?: unknown; color?: unknown; temperature?: unknown };

function integer(value: unknown, minimum = 0) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > 255) throw new Error("Invalid MMU index");
  return number;
}

function quoted(value: unknown) {
  return String(value ?? "").replace(/["\r\n]/g, "").slice(0, 160);
}

export async function GET() {
  try {
    return NextResponse.json(await getMmuStatus());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to query MMU" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { action?: unknown; gate?: unknown; tool?: unknown; entries?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    const status = await getMmuStatus();
    if (!status.available) return NextResponse.json({ error: "Happy Hare MMU is not available" }, { status: 404 });
    if (status.printing) return NextResponse.json({ error: "MMU manual controls are disabled while printing" }, { status: 409 });
    const gateCount = Math.max(0, Number(status.mmu?.num_gates) || 0);
    const checkedGate = (value: unknown) => {
      const gate = integer(value);
      if (gateCount > 0 && gate >= gateCount) throw new Error("MMU gate is out of range");
      return gate;
    };

    let script = "";
    if (["select", "preload", "eject", "check"].includes(action)) {
      const gate = checkedGate(body.gate);
      const commands: Record<string, string> = {
        select: "MMU_SELECT", preload: "MMU_PRELOAD", eject: "MMU_EJECT", check: "MMU_CHECK_GATE"
      };
      script = `${commands[action]} GATE=${gate}`;
    } else if (action === "bypass") {
      script = "MMU_SELECT BYPASS=1";
    } else if (action === "tool") {
      const tool = integer(body.tool);
      if (gateCount > 0 && tool >= gateCount) throw new Error("MMU tool is out of range");
      script = `T${tool}`;
    } else if (["home", "recover", "load", "unload", "unlock"].includes(action)) {
      const commands: Record<string, string> = {
        home: "MMU_HOME", recover: "MMU_RECOVER", load: "MMU_LOAD", unload: "MMU_UNLOAD", unlock: "MMU_UNLOCK"
      };
      script = commands[action];
    } else if (action === "apply-map") {
      if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > 64) {
        return NextResponse.json({ error: "Invalid MMU gate map" }, { status: 400 });
      }
      script = (body.entries as GateMapEntry[]).map((entry) => {
        const gate = checkedGate(entry.gate);
        const color = String(entry.color ?? "").replace(/^#/, "").slice(0, 8);
        if (color && !/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) throw new Error("Invalid filament color");
        const temperature = Math.max(0, Math.min(500, Number(entry.temperature) || 0));
        return `MMU_GATE_MAP GATE=${gate} NAME="${quoted(entry.name)}" MATERIAL="${quoted(entry.material)}" VENDOR="${quoted(entry.vendor)}" COLOR="${color}" TEMP=${temperature} QUIET=1`;
      }).join("\n");
    } else {
      return NextResponse.json({ error: "Unsupported MMU action" }, { status: 400 });
    }

    const result = await runGcodeScript(script);
    return NextResponse.json({ result, status: await getMmuStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to control MMU" }, { status: 502 });
  }
}
