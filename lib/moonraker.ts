import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

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
  progress: number;
  printDetails: MoonrakerPrintDetails;
  printing: boolean;
  zTiltAvailable: boolean;
  homedAxes: string;
  allAxesHomed: boolean;
  position: {
    x: number;
    y: number;
    z: number;
  };
  speed: number;
  activeExtruder: string;
  excludeObject: ExcludeObjectStatus;
  positionLimits: {
    x: AxisLimit;
    y: AxisLimit;
    z: AxisLimit;
  };
  extruders: ExtruderInfo[];
  zOffset: number;
};

export type MoonrakerPrintDetails = {
  filename: string;
  state: string;
  message: string;
  progress: number;
  filePosition: number;
  fileSize: number;
  printDuration: number;
  totalDuration: number;
  filamentUsed: number;
  info: {
    currentLayer?: number;
    totalLayer?: number;
  };
  metadata?: Partial<GcodeFileEntry>;
  raw: unknown;
};

export type ExcludeObjectStatus = {
  objects: Array<{
    name: string;
    polygon?: unknown;
  }>;
  excludedObjects: string[];
  currentObject: string;
};

export type AxisLimit = {
  min: number;
  max: number;
};

export type ExtruderInfo = {
  name: string;
  label: string;
};

export type HeaterStatus = {
  name: string;
  label: string;
  temperature: number;
  target: number;
  power?: number;
  color?: string;
};

export type AuxiliaryControl = {
  name: string;
  label: string;
  type: "fan" | "led";
  source: "fan" | "fan_generic" | "heater_fan" | "controller_fan" | "temperature_fan" | "output_pin" | "led";
  controllable: boolean;
  value: number;
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

export type UpdateManagerApp = {
  name: string;
  configuredType: string;
  channel: string;
  version: string;
  remoteVersion: string;
  isValid: boolean;
  isDirty: boolean;
  detached: boolean;
  commitsBehind: number;
  warnings: string[];
};

export type UpdateManagerStatus = {
  busy: boolean;
  versionInfo: UpdateManagerApp[];
  raw: unknown;
};

export type GcodeStoreEntry = {
  message: string;
  time: number;
  type: "command" | "response";
};

export type BedMeshProfile = {
  name: string;
  points: number[][];
  meshParams: Record<string, unknown>;
};

export type BedMeshCurrent = {
  name: string;
  probedMatrix: number[][];
  meshMatrix: number[][];
  meshParams: Record<string, unknown>;
};

export type BedMeshDump = {
  current: BedMeshCurrent | null;
  profiles: BedMeshProfile[];
  calibration: unknown;
  probeOffsets: number[];
  axisMinimum: number[];
  axisMaximum: number[];
  raw: unknown;
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

export async function uploadGcodeFile(file: File) {
  const formData = new FormData();
  formData.append("root", "gcodes");
  formData.append("path", "");
  formData.append("file", file, file.name);

  return moonrakerFetch("/server/files/upload", {
    method: "POST",
    body: formData
  });
}

export async function deleteGcodeFile(filename: string) {
  const cleanFilename = filename.trim().replace(/^\/+/, "");
  const payload = await moonrakerFetch(`/server/files/gcodes/${cleanFilename.split("/").map(encodeURIComponent).join("/")}`, {
    method: "DELETE"
  });
  return payload?.result ?? payload;
}

export async function getMoonrakerStatus(): Promise<MoonrakerStatus> {
  const payload = await moonrakerFetch(
    "/printer/objects/query?webhooks=state,state_message&print_stats=state,filename,message,print_duration,total_duration,filament_used,info&virtual_sdcard=progress,file_position,file_size&display_status=message,progress&configfile=settings&toolhead=homed_axes,position,extruder&gcode_move=gcode_position,homing_origin,speed&exclude_object=objects,excluded_objects,current_object"
  );
  const status = payload?.result?.status ?? payload?.status ?? {};
  const webhooks = status.webhooks ?? {};
  const printStats = status.print_stats ?? {};
  const virtualSdcard = status.virtual_sdcard ?? {};
  const displayStatus = status.display_status ?? {};
  const configSettings = status.configfile?.settings ?? {};
  const toolhead = status.toolhead ?? {};
  const gcodeMove = status.gcode_move ?? {};
  const excludeObject = status.exclude_object ?? {};
  const position = Array.isArray(gcodeMove.gcode_position)
    ? gcodeMove.gcode_position
    : Array.isArray(toolhead.position)
      ? toolhead.position
      : [];
  const homingOrigin = Array.isArray(gcodeMove.homing_origin) ? gcodeMove.homing_origin : [];
  const printState = String(printStats.state ?? "unknown");
  const filename = String(printStats.filename ?? "");
  const homedAxes = String(toolhead.homed_axes ?? "").toLowerCase();
  const positionLimits = {
    x: readAxisLimit(configSettings.stepper_x),
    y: readAxisLimit(configSettings.stepper_y),
    z: readAxisLimit(configSettings.stepper_z)
  };

  let metadata: Partial<GcodeFileEntry> | undefined;
  if (filename) {
    try {
      metadata = await getGcodeMetadata(filename);
    } catch {
      metadata = undefined;
    }
  }

  return {
    webhooksState: String(webhooks.state ?? "unknown"),
    webhooksMessage: String(webhooks.message ?? ""),
    printState,
    filename,
    progress: Math.min(Math.max(toNumber(virtualSdcard.progress), 0), 1),
    printDetails: {
      filename,
      state: printState,
      message: String(printStats.message ?? displayStatus.message ?? ""),
      progress: Math.min(Math.max(toNumber(virtualSdcard.progress ?? displayStatus.progress), 0), 1),
      filePosition: toNumber(virtualSdcard.file_position),
      fileSize: toNumber(virtualSdcard.file_size),
      printDuration: toNumber(printStats.print_duration),
      totalDuration: toNumber(printStats.total_duration),
      filamentUsed: toNumber(printStats.filament_used),
      info: {
        currentLayer: printStats.info?.current_layer === undefined ? undefined : toNumber(printStats.info.current_layer),
        totalLayer: printStats.info?.total_layer === undefined ? undefined : toNumber(printStats.info.total_layer)
      },
      metadata,
      raw: {
        print_stats: printStats,
        virtual_sdcard: virtualSdcard,
        display_status: displayStatus
      }
    },
    printing: printState === "printing" || printState === "paused",
    zTiltAvailable: Boolean(configSettings.z_tilt),
    homedAxes,
    allAxesHomed: homedAxes.includes("x") && homedAxes.includes("y") && homedAxes.includes("z"),
    position: {
      x: toNumber(position[0]),
      y: toNumber(position[1]),
      z: toNumber(position[2])
    },
    speed: toNumber(gcodeMove.speed),
    activeExtruder: String(toolhead.extruder ?? ""),
    excludeObject: {
      objects: Array.isArray(excludeObject.objects)
        ? (excludeObject.objects as unknown[])
            .filter((object): object is Record<string, unknown> => Boolean(object) && typeof object === "object")
            .map((object) => ({
              name: String(object.name ?? ""),
              polygon: object.polygon
            }))
            .filter((object) => object.name)
        : [],
      excludedObjects: Array.isArray(excludeObject.excluded_objects)
        ? (excludeObject.excluded_objects as unknown[]).map((object) => String(object))
        : [],
      currentObject: String(excludeObject.current_object ?? "")
    },
    positionLimits,
    extruders: listExtruders(configSettings),
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

function updateAppFromEntry(name: string, value: unknown): UpdateManagerApp {
  const entry = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const version = String(entry.version ?? entry.local_version ?? entry.current_version ?? "");
  const remoteVersion = String(entry.remote_version ?? entry.remoteVersion ?? entry.version_remote ?? "");
  const commitsBehindValue = entry.commits_behind ?? entry.commitsBehind ?? entry.behind;
  const commitsBehind = Number.isFinite(Number(commitsBehindValue)) ? Number(commitsBehindValue) : 0;
  const warnings = Array.isArray(entry.warnings) ? entry.warnings.map(String) : [];

  return {
    name,
    configuredType: String(entry.configured_type ?? entry.type ?? ""),
    channel: String(entry.channel ?? ""),
    version,
    remoteVersion,
    isValid: entry.is_valid === undefined ? true : Boolean(entry.is_valid),
    isDirty: Boolean(entry.is_dirty ?? entry.dirty),
    detached: Boolean(entry.detached),
    commitsBehind,
    warnings
  };
}

export async function getUpdateManagerStatus(refresh = false): Promise<UpdateManagerStatus> {
  const payload = await moonrakerFetch(`/machine/update/status?refresh=${refresh ? "true" : "false"}`);
  const result = payload?.result ?? payload ?? {};
  const versionInfo = result.version_info && typeof result.version_info === "object"
    ? (result.version_info as Record<string, unknown>)
    : {};

  return {
    busy: Boolean(result.busy),
    versionInfo: Object.entries(versionInfo).map(([name, value]) => updateAppFromEntry(name, value)),
    raw: result
  };
}

export async function updateAllComponents() {
  const payload = await moonrakerFetch("/machine/update/full", { method: "POST" });
  return payload?.result ?? payload;
}

export async function updateComponent(name: string, configuredType?: string) {
  const encodedName = encodeURIComponent(name);
  const type = configuredType?.toLowerCase() ?? "";
  const path =
    name === "system" || type === "system"
      ? "/machine/update/system"
      : name === "moonraker"
        ? "/machine/update/moonraker"
        : name === "klipper"
          ? "/machine/update/klipper"
          : `/machine/update/client?name=${encodedName}`;
  const payload = await moonrakerFetch(path, { method: "POST" });
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

function matrixFrom(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map(toNumber));
}

function readMeshParams(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function getBedMeshDump(): Promise<BedMeshDump> {
  const payload = await moonrakerFetch("/printer/bed_mesh/dump_mesh");
  const result = payload?.result ?? payload ?? {};
  const currentMesh = result.current_mesh && typeof result.current_mesh === "object"
    ? result.current_mesh as Record<string, unknown>
    : {};
  const profilesSource = result.profiles && typeof result.profiles === "object"
    ? result.profiles as Record<string, unknown>
    : {};

  const currentProbed = matrixFrom(currentMesh.probed_matrix);
  const currentMeshMatrix = matrixFrom(currentMesh.mesh_matrix);
  const currentName = String(currentMesh.name ?? currentMesh.profile_name ?? "");
  const current = currentName || currentProbed.length || currentMeshMatrix.length
    ? {
        name: currentName,
        probedMatrix: currentProbed,
        meshMatrix: currentMeshMatrix,
        meshParams: readMeshParams(currentMesh.mesh_params)
      }
    : null;

  return {
    current,
    profiles: Object.entries(profilesSource).map(([name, value]) => {
      const profile = value && typeof value === "object" ? value as Record<string, unknown> : {};
      return {
        name,
        points: matrixFrom(profile.points),
        meshParams: readMeshParams(profile.mesh_params)
      };
    }),
    calibration: result.calibration,
    probeOffsets: Array.isArray(result.probe_offsets) ? result.probe_offsets.map(toNumber) : [],
    axisMinimum: Array.isArray(result.axis_minimum) ? result.axis_minimum.map(toNumber) : [],
    axisMaximum: Array.isArray(result.axis_maximum) ? result.axis_maximum.map(toNumber) : [],
    raw: result
  };
}

function formatProfileName(name: string) {
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) throw new Error("Invalid mesh profile name");
  return trimmed;
}

export async function runBedMeshAction(action: string, profileName?: string) {
  if (action === "clear") return runGcodeScript("BED_MESH_CLEAR");
  if (action === "calibrate") return runGcodeScript(profileName ? `BED_MESH_CALIBRATE PROFILE=${formatProfileName(profileName)}` : "BED_MESH_CALIBRATE");
  if (action === "load") return runGcodeScript(`BED_MESH_PROFILE LOAD=${formatProfileName(profileName ?? "")}`);
  if (action === "save-profile") return runGcodeScript(`BED_MESH_PROFILE SAVE=${formatProfileName(profileName ?? "")}`);
  if (action === "remove") return runGcodeScript(`BED_MESH_PROFILE REMOVE=${formatProfileName(profileName ?? "")}`);
  if (action === "save-config") return runGcodeScript("SAVE_CONFIG");
  throw new Error("Invalid bed mesh action");
}

// PID can take longer than fetch's default response-header timeout.
export function runPidCalibration(heater: string, target: number): Promise<void> {
  const url = new URL(moonrakerPath("/printer/gcode/script"));
  const body = JSON.stringify({ script: `PID_CALIBRATE HEATER="${heater}" TARGET=${target}` });
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { text += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        try {
          const payload = JSON.parse(text);
          if (response.statusCode !== 200 || payload.error || payload.result !== "ok") {
            reject(new Error(payload.error?.message ?? "PID completion was not confirmed"));
          } else resolve();
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(60 * 60 * 1000, () => request.destroy(new Error("PID response timed out; completion was not confirmed")));
    request.on("error", reject);
    request.end(body);
  });
}

export async function getGcodeStore(count = 100): Promise<GcodeStoreEntry[]> {
  const safeCount = Math.min(Math.max(Math.round(count), 1), 1000);
  const payload = await moonrakerFetch(`/server/gcode_store?count=${safeCount}`);
  const entries = payload?.result?.gcode_store ?? payload?.gcode_store ?? [];
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map<GcodeStoreEntry>((entry) => ({
      message: String(entry.message ?? ""),
      time: toNumber(entry.time),
      type: entry.type === "command" ? "command" : "response"
    }))
    .filter((entry) => entry.message.trim());
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

function displayNameFromObject(name: string) {
  return name
    .replace(/^(fan_generic|heater_fan|controller_fan|temperature_fan|output_pin|neopixel|dotstar|pca9533|pca9632|led)\s+/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function configNameFromObject(name: string) {
  return name
    .replace(/^(fan_generic|heater_fan|controller_fan|temperature_fan|output_pin|neopixel|dotstar|pca9533|pca9632|led)\s+/i, "")
    .trim();
}

function auxiliarySource(name: string): AuxiliaryControl["source"] | undefined {
  if (name === "fan") return "fan";
  if (/^fan_generic\s+/i.test(name)) return "fan_generic";
  if (/^heater_fan\s+/i.test(name)) return "heater_fan";
  if (/^controller_fan\s+/i.test(name)) return "controller_fan";
  if (/^temperature_fan\s+/i.test(name)) return "temperature_fan";
  if (/^output_pin\s+/i.test(name)) return "output_pin";
  if (/^(neopixel|dotstar|pca9533|pca9632|led)\s+/i.test(name)) return "led";
  return undefined;
}

function colorFromLedData(value: unknown) {
  const firstColor = Array.isArray(value) ? value.find((item) => Array.isArray(item)) : undefined;
  if (!Array.isArray(firstColor) || firstColor.length < 3) return undefined;

  const channels = firstColor.slice(0, 3).map((channel) => {
    const number = Number(channel);
    if (!Number.isFinite(number)) return 0;
    return Math.min(Math.max(Math.round(number <= 1 ? number * 255 : number), 0), 255);
  });

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function ledBrightness(value: unknown) {
  const firstColor = Array.isArray(value) ? value.find((item) => Array.isArray(item)) : undefined;
  if (!Array.isArray(firstColor) || firstColor.length < 3) return 0;
  const channels = firstColor.slice(0, 3).map((channel) => {
    const number = Number(channel);
    return Number.isFinite(number) ? Math.min(Math.max(number, 0), 1) : 0;
  });
  return Math.max(...channels);
}

function extruderIndex(name: string) {
  if (name === "extruder") return 0;
  const match = name.match(/^extruder(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function listExtruders(configSettings: Record<string, unknown>): ExtruderInfo[] {
  return Object.keys(configSettings)
    .filter((name) => /^extruder\d*$/.test(name))
    .sort((a, b) => extruderIndex(a) - extruderIndex(b))
    .map((name) => ({
      name,
      label: `T${extruderIndex(name)}`
    }));
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

export async function getAuxiliaryControls(): Promise<AuxiliaryControl[]> {
  const objectsPayload = await moonrakerFetch("/printer/objects/list");
  const objects = objectsPayload?.result?.objects ?? objectsPayload?.objects ?? [];
  if (!Array.isArray(objects) || objects.length === 0) return [];

  const names = Array.from(new Set(objects.filter((name): name is string => typeof name === "string")));
  const auxiliaryNames = names.filter((name) => auxiliarySource(name));
  if (auxiliaryNames.length === 0) return [];

  const params = new URLSearchParams();
  for (const name of auxiliaryNames) {
    const source = auxiliarySource(name);
    if (source === "output_pin") {
      params.append(name, "value");
    } else if (source === "led") {
      params.append(name, "color_data");
    } else {
      params.append(name, "speed,rpm");
    }
  }

  const statusPayload = await moonrakerFetch(`/printer/objects/query?${params.toString()}`);
  const status = statusPayload?.result?.status ?? statusPayload?.status ?? {};

  return auxiliaryNames.map((name) => {
    const source = auxiliarySource(name)!;
    const objectStatus = status[name] ?? {};
    const isLed = source === "led";
    const value = isLed
      ? ledBrightness(objectStatus.color_data)
      : source === "output_pin"
        ? toNumber(objectStatus.value)
        : toNumber(objectStatus.speed);

    return {
      name,
      label: name === "fan" ? "Fan" : displayNameFromObject(name),
      type: isLed ? "led" : "fan",
      source,
      controllable: source === "fan" || source === "fan_generic" || source === "output_pin" || source === "led",
      value: Math.min(Math.max(value, 0), 1),
      color: isLed ? colorFromLedData(objectStatus.color_data) : undefined
    };
  });
}

export async function setAuxiliaryControl(name: string, value?: number, color?: string) {
  const source = auxiliarySource(name);
  if (!source) throw new Error("Unsupported auxiliary control");
  if (source === "heater_fan" || source === "controller_fan" || source === "temperature_fan") {
    throw new Error("This fan is controlled automatically by Klipper");
  }

  const safeName = name.replace(/["\r\n]/g, "");
  const safeValue = Math.min(Math.max(Number(value ?? 0), 0), 1);

  if (source === "fan") {
    return runGcodeScript(safeValue <= 0 ? "M107" : `M106 S${Math.round(safeValue * 255)}`);
  }

  if (source === "fan_generic") {
    return runGcodeScript(`SET_FAN_SPEED FAN="${configNameFromObject(safeName)}" SPEED=${formatGcodeNumber(safeValue)}`);
  }

  if (source === "output_pin") {
    return runGcodeScript(`SET_PIN PIN="${configNameFromObject(safeName)}" VALUE=${formatGcodeNumber(safeValue)}`);
  }

  const safeColor = typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";
  const red = parseInt(safeColor.slice(1, 3), 16) / 255;
  const green = parseInt(safeColor.slice(3, 5), 16) / 255;
  const blue = parseInt(safeColor.slice(5, 7), 16) / 255;
  return runGcodeScript(
    `SET_LED LED="${configNameFromObject(safeName)}" RED=${formatGcodeNumber(red)} GREEN=${formatGcodeNumber(green)} BLUE=${formatGcodeNumber(blue)}`
  );
}

export async function extrudeFilament(extruder: string, distance: number, speed: number) {
  const safeExtruder = extruder.replace(/"/g, "");
  const safeDistance = formatGcodeNumber(distance);
  const safeFeedrate = formatGcodeNumber(Math.max(0.1, speed) * 60);

  return runGcodeScript(
    [
      "SAVE_GCODE_STATE NAME=klipper_editor_extrude",
      `ACTIVATE_EXTRUDER EXTRUDER="${safeExtruder}"`,
      "M83",
      `G1 E${safeDistance} F${safeFeedrate}`,
      "RESTORE_GCODE_STATE NAME=klipper_editor_extrude"
    ].join("\n")
  );
}

function formatGcodeNumber(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}
