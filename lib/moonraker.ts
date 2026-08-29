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

export type GcodeThumbnail = {
  width: number;
  height: number;
  size?: number;
  relativePath: string;
};

export type GcodeFileEntry = {
  path: string;
  name: string;
  size: number;
  modified: number;
  permissions?: string;
  estimatedTime?: number;
  filamentTotal?: number;
  layerHeight?: number;
  objectHeight?: number;
  thumbnails: GcodeThumbnail[];
};

export type GcodeHistoryEntry = {
  id: string;
  filename: string;
  status: string;
  startTime: number;
  endTime: number;
  printDuration: number;
  totalDuration: number;
  filamentUsed: number;
  metadata?: Partial<GcodeFileEntry>;
};

function moonrakerPath(path: string) {
  return `${moonrakerUrl}${path}`;
}

export function moonrakerFilePath(root: string, filePath: string) {
  const cleanRoot = root.replace(/^\/+|\/+$/g, "");
  const cleanPath = filePath.split("/").map(encodeURIComponent).join("/");
  return moonrakerPath(`/server/files/${cleanRoot}/${cleanPath}`);
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

export async function startPrint(filename: string) {
  const payload = await moonrakerFetch("/printer/print/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename })
  });
  return payload?.result ?? payload;
}

export async function pausePrint() {
  const payload = await moonrakerFetch("/printer/print/pause", { method: "POST" });
  return payload?.result ?? payload;
}

export async function resumePrint() {
  const payload = await moonrakerFetch("/printer/print/resume", { method: "POST" });
  return payload?.result ?? payload;
}

export async function cancelPrint() {
  const payload = await moonrakerFetch("/printer/print/cancel", { method: "POST" });
  return payload?.result ?? payload;
}

function normalizeThumbnail(value: unknown): GcodeThumbnail | undefined {
  if (!value || typeof value !== "object") return undefined;
  const thumbnail = value as Record<string, unknown>;
  const relativePath = typeof thumbnail.relative_path === "string" ? thumbnail.relative_path : "";
  if (!relativePath) return undefined;

  return {
    width: toNumber(thumbnail.width),
    height: toNumber(thumbnail.height),
    size: thumbnail.size === undefined ? undefined : toNumber(thumbnail.size),
    relativePath
  };
}

function normalizeMetadata(value: unknown): Partial<GcodeFileEntry> {
  const metadata = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const filament = metadata.filament_total ?? metadata.filament_used;

  return {
    estimatedTime: metadata.estimated_time === undefined ? undefined : toNumber(metadata.estimated_time),
    filamentTotal: filament === undefined ? undefined : toNumber(filament),
    layerHeight: metadata.layer_height === undefined ? undefined : toNumber(metadata.layer_height),
    objectHeight: metadata.object_height === undefined ? undefined : toNumber(metadata.object_height),
    thumbnails: Array.isArray(metadata.thumbnails)
      ? metadata.thumbnails.map(normalizeThumbnail).filter((thumbnail): thumbnail is GcodeThumbnail => Boolean(thumbnail))
      : []
  };
}

export async function getGcodeMetadata(filename: string): Promise<Partial<GcodeFileEntry>> {
  const payload = await moonrakerFetch(`/server/files/metadata?filename=${encodeURIComponent(filename)}`);
  return normalizeMetadata(payload?.result ?? payload);
}

export async function listGcodeFiles(): Promise<GcodeFileEntry[]> {
  const payload = await moonrakerFetch("/server/files/list?root=gcodes");
  const files = payload?.result ?? payload;
  if (!Array.isArray(files)) return [];

  const gcodeFiles = files
    .filter((file): file is Record<string, unknown> => Boolean(file) && typeof file === "object")
    .filter((file) => String(file.type ?? "file") === "file")
    .filter((file) => String(file.path ?? file.filename ?? "").toLowerCase().endsWith(".gcode"));

  return Promise.all(
    gcodeFiles.map(async (file) => {
      const path = String(file.path ?? file.filename ?? "");
      let metadata: Partial<GcodeFileEntry> = { thumbnails: [] };

      try {
        metadata = await getGcodeMetadata(path);
      } catch {
        metadata = { thumbnails: [] };
      }

      return {
        path,
        name: path.split("/").at(-1) ?? path,
        size: toNumber(file.size),
        modified: toNumber(file.modified),
        permissions: typeof file.permissions === "string" ? file.permissions : undefined,
        estimatedTime: metadata.estimatedTime,
        filamentTotal: metadata.filamentTotal,
        layerHeight: metadata.layerHeight,
        objectHeight: metadata.objectHeight,
        thumbnails: metadata.thumbnails ?? []
      };
    })
  );
}

export async function listPrintHistory(limit = 50): Promise<GcodeHistoryEntry[]> {
  const payload = await moonrakerFetch(`/server/history/list?limit=${limit}&order=desc`);
  const jobs = payload?.result?.jobs ?? payload?.jobs ?? [];
  if (!Array.isArray(jobs)) return [];

  return jobs
    .filter((job): job is Record<string, unknown> => Boolean(job) && typeof job === "object")
    .map((job) => {
      const metadata = normalizeMetadata(job.metadata);

      return {
        id: String(job.job_id ?? `${job.filename ?? "job"}-${job.start_time ?? ""}`),
        filename: String(job.filename ?? ""),
        status: String(job.status ?? "unknown"),
        startTime: toNumber(job.start_time),
        endTime: toNumber(job.end_time),
        printDuration: toNumber(job.print_duration),
        totalDuration: toNumber(job.total_duration),
        filamentUsed: toNumber(job.filament_used),
        metadata
      };
    });
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
