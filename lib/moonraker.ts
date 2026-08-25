function normalizeMoonrakerUrl(input: string) {
  const markdownLink = input.match(/\]\((https?:\/\/[^)]+)\)/i);
  const rawUrl = markdownLink?.[1] ?? input;
  return rawUrl.trim().replace(/\/+$/, "");
}

const moonrakerUrl = normalizeMoonrakerUrl(process.env.RATOS_MOONRAKER_URL || "http://127.0.0.1:7125");

export type MoonrakerStatus = {
  webhooksState: string;
  webhooksMessage: string;
  printState: string;
  filename: string;
  printing: boolean;
  zTiltAvailable: boolean;
};

export type HeaterStatus = {
  name: string;
  label: string;
  temperature: number;
  target: number;
  power?: number;
  color?: string;
};

function moonrakerPath(path: string) {
  return `${moonrakerUrl}${path}`;
}

async function moonrakerFetch(path: string, init?: RequestInit) {
  const response = await fetch(moonrakerPath(path), {
    ...init,
    cache: "no-store"
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? JSON.stringify(payload.error)
        : `Moonraker request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export async function getMoonrakerStatus(): Promise<MoonrakerStatus> {
  const payload = await moonrakerFetch(
    "/printer/objects/query?webhooks=state,state_message&print_stats=state,filename&configfile=settings"
  );
  const status = payload?.result?.status ?? payload?.status ?? {};
  const webhooks = status.webhooks ?? {};
  const printStats = status.print_stats ?? {};
  const configSettings = status.configfile?.settings ?? {};
  const printState = String(printStats.state ?? "unknown");

  return {
    webhooksState: String(webhooks.state ?? "unknown"),
    webhooksMessage: String(webhooks.message ?? ""),
    printState,
    filename: String(printStats.filename ?? ""),
    printing: printState === "printing" || printState === "paused",
    zTiltAvailable: Boolean(configSettings.z_tilt)
  };
}

export async function firmwareRestart() {
  const payload = await moonrakerFetch("/printer/firmware_restart", { method: "POST" });
  return payload?.result ?? payload;
}

export async function emergencyStop() {
  const payload = await moonrakerFetch("/printer/emergency_stop", { method: "POST" });
  return payload?.result ?? payload;
}

export async function runGcodeScript(script: string) {
  const payload = await moonrakerFetch("/printer/gcode/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script })
  });
  return payload?.result ?? payload;
}

function heaterLabel(name: string) {
  if (name === "heater_bed") return "BED";
  if (name === "extruder") return "EX1";

  const extruderMatch = name.match(/^extruder(\d+)$/);
  if (extruderMatch) return `EX${Number(extruderMatch[1]) + 1}`;

  return name.replace(/^heater_generic\s+/i, "").toUpperCase();
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toCssColor(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();

  if (Array.isArray(value) && value.length >= 3) {
    const channels = value.slice(0, 3).map((channel) => {
      const number = Number(channel);
      if (!Number.isFinite(number)) return 0;
      return Math.round(number <= 1 ? number * 255 : number);
    });

    return `rgb(${channels.map((channel) => Math.min(Math.max(channel, 0), 255)).join(", ")})`;
  }

  return undefined;
}

export async function getHeaters(names?: string[]): Promise<HeaterStatus[]> {
  let availableHeaters = names?.filter((heater) => typeof heater === "string" && heater.trim()).map((heater) => heater.trim());

  if (!availableHeaters || availableHeaters.length === 0) {
    const heatersPayload = await moonrakerFetch("/printer/objects/query?heaters=available_heaters");
    const heatersStatus = heatersPayload?.result?.status ?? heatersPayload?.status ?? {};
    availableHeaters = heatersStatus.heaters?.available_heaters;
  }

  if (!Array.isArray(availableHeaters) || availableHeaters.length === 0) {
    return [];
  }

  availableHeaters = Array.from(new Set(availableHeaters.filter((heater): heater is string => typeof heater === "string")));

  const params = new URLSearchParams();
  for (const heater of availableHeaters) {
    params.append(heater, "temperature,target,power,color");
  }

  const temperaturesPayload = await moonrakerFetch(`/printer/objects/query?${params.toString()}`);
  const temperaturesStatus = temperaturesPayload?.result?.status ?? temperaturesPayload?.status ?? {};

  return availableHeaters
    .map((heater) => {
      const status = temperaturesStatus[heater] ?? {};
      return {
        name: heater,
        label: heaterLabel(heater),
        temperature: toNumber(status.temperature),
        target: toNumber(status.target),
        power: status.power === undefined ? undefined : toNumber(status.power),
        color: toCssColor(status.color)
      };
    });
}

export async function setHeaterTarget(name: string, target: number) {
  const safeName = name.replace(/"/g, "");
  const safeTarget = Math.max(0, target);
  return runGcodeScript(`SET_HEATER_TEMPERATURE HEATER="${safeName}" TARGET=${safeTarget}`);
}
