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
  homedAxes: string;
  allAxesHomed: boolean;
  position: {
    x: number;
    y: number;
    z: number;
  };
  positionLimits: {
    x: AxisLimit;
    y: AxisLimit;
    z: AxisLimit;
  };
  zOffset: number;
};

export type AxisLimit = {
  min: number;
  max: number;
};

export type HeaterStatus = {
  name: string;
  label: string;
  temperature: number;
  target: number;
  power?: number;
  color?: string;
};

export type MainsailUiSettings = {
  mode: string;
  theme: string;
  logo: string;
  primary: string;
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
    "/printer/objects/query?webhooks=state,state_message&print_stats=state,filename&configfile=settings&toolhead=homed_axes,position&gcode_move=gcode_position,homing_origin"
  );
  const status = payload?.result?.status ?? payload?.status ?? {};
  const webhooks = status.webhooks ?? {};
  const printStats = status.print_stats ?? {};
  const configSettings = status.configfile?.settings ?? {};
  const toolhead = status.toolhead ?? {};
  const gcodeMove = status.gcode_move ?? {};
  const position = Array.isArray(gcodeMove.gcode_position)
    ? gcodeMove.gcode_position
    : Array.isArray(toolhead.position)
      ? toolhead.position
      : [];
  const homingOrigin = Array.isArray(gcodeMove.homing_origin) ? gcodeMove.homing_origin : [];
  const printState = String(printStats.state ?? "unknown");
  const homedAxes = String(toolhead.homed_axes ?? "").toLowerCase();
  const positionLimits = {
    x: readAxisLimit(configSettings.stepper_x),
    y: readAxisLimit(configSettings.stepper_y),
    z: readAxisLimit(configSettings.stepper_z)
  };

  return {
    webhooksState: String(webhooks.state ?? "unknown"),
    webhooksMessage: String(webhooks.message ?? ""),
    printState,
    filename: String(printStats.filename ?? ""),
    printing: printState === "printing" || printState === "paused",
    zTiltAvailable: Boolean(configSettings.z_tilt),
    homedAxes,
    allAxesHomed: homedAxes.includes("x") && homedAxes.includes("y") && homedAxes.includes("z"),
    position: {
      x: toNumber(position[0]),
      y: toNumber(position[1]),
      z: toNumber(position[2])
    },
    positionLimits,
    zOffset: toNumber(homingOrigin[2])
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

export async function shutdownMachine() {
  const payload = await moonrakerFetch("/machine/shutdown", { method: "POST" });
  return payload?.result ?? payload;
}

export async function rebootMachine() {
  const payload = await moonrakerFetch("/machine/reboot", { method: "POST" });
  return payload?.result ?? payload;
}

export async function getMainsailUiSettings(): Promise<MainsailUiSettings> {
  const payload = await moonrakerFetch("/server/database/item?namespace=mainsail&key=uiSettings");
  const value = payload?.result?.value ?? payload?.value ?? {};

  return {
    mode: typeof value.mode === "string" && value.mode.trim() ? value.mode.trim() : "dark",
    theme: typeof value.theme === "string" && value.theme.trim() ? value.theme.trim() : "mainsail",
    logo: typeof value.logo === "string" && value.logo.trim() ? value.logo.trim() : "#D41216",
    primary: typeof value.primary === "string" && value.primary.trim() ? value.primary.trim() : "#2196f3"
  };
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

function readAxisLimit(stepperConfig: unknown): AxisLimit {
  const config = stepperConfig && typeof stepperConfig === "object" ? stepperConfig as Record<string, unknown> : {};
  return {
    min: toNumber(config.position_min),
    max: toNumber(config.position_max)
  };
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
