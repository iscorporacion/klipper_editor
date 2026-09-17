import { NextRequest, NextResponse } from "next/server";
import { runGcodeScript } from "@/lib/moonraker";

function encodeParameterValue(value: string) {
  if (/^[^\s"'\\;]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: string; parameters?: Record<string, unknown> };
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: "Macro name is required" }, { status: 400 });
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return NextResponse.json({ error: "Invalid macro name" }, { status: 400 });
    }

    const parameters = Object.entries(body.parameters ?? {}).map(([key, rawValue]) => {
      const parameterName = key.trim().toUpperCase();
      const value = typeof rawValue === "string" ? rawValue.trim() : "";
      if (!/^[A-Z_][A-Z0-9_]*$/.test(parameterName)) throw new Error(`Invalid macro parameter: ${key}`);
      if (!value || /[\r\n\0]/.test(value)) throw new Error(`Invalid value for ${parameterName}`);
      return `${parameterName}=${encodeParameterValue(value)}`;
    });

    const result = await runGcodeScript([name, ...parameters].join(" "));
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to execute macro" },
      { status: 502 }
    );
  }
}
