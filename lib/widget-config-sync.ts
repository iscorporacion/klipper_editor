import fs from "node:fs/promises";
import path from "node:path";
import {
  getMoonrakerFileRoots,
  readMoonrakerConfigFile,
  uploadMoonrakerConfigFile
} from "@/lib/moonraker";

const registry = {
  tray: {
    source: "mmu_config/bandeja.cfg",
    remote: "bandeja.cfg",
    include: "[include bandeja.cfg]"
  },
  statusbar: {
    source: "mmu_config/statusbar_leds.cfg",
    remote: "statusbar_leds.cfg",
    include: "[include statusbar_leds.cfg]"
  }
} as const;

export type ManagedWidgetConfig = keyof typeof registry;

export function widgetConfigSyncEnabled() {
  return process.env.KEDITOR_REMOTE_WIDGET_CONFIG !== "false";
}

function definition(widget: string) {
  if (!(widget in registry)) throw new Error("Unknown managed widget configuration");
  return registry[widget as ManagedWidgetConfig];
}

async function configWritable() {
  const roots = await getMoonrakerFileRoots();
  return roots.find((root) => root.name === "config")?.permissions?.includes("w") === true;
}

async function optionalRemoteFile(filePath: string) {
  try {
    return await readMoonrakerConfigFile(filePath);
  } catch {
    return null;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function backupName(filePath: string) {
  const extension = path.posix.extname(filePath);
  return `${filePath.slice(0, -extension.length)}-${timestamp()}${extension}`;
}

export async function getWidgetConfigSyncStatus(widget: string) {
  if (!widgetConfigSyncEnabled()) return { enabled: false, writable: false, installed: false, current: false };
  const item = definition(widget);
  const writable = await configWritable();
  const [remote, source] = await Promise.all([
    optionalRemoteFile(item.remote),
    fs.readFile(path.join(process.cwd(), item.source), "utf8")
  ]);
  return {
    enabled: true,
    writable,
    installed: remote !== null,
    current: remote === source,
    remotePath: item.remote
  };
}

export async function installWidgetConfig(widget: string) {
  if (!widgetConfigSyncEnabled()) throw new Error("Remote widget configuration sync is disabled");
  const item = definition(widget);
  if (!(await configWritable())) throw new Error("Moonraker config root is not writable");

  const source = await fs.readFile(path.join(process.cwd(), item.source), "utf8");
  const existing = await optionalRemoteFile(item.remote);
  const printerConfig = await readMoonrakerConfigFile("printer.cfg");
  const backupId = timestamp();
  const backups: string[] = [];

  await uploadMoonrakerConfigFile(`printer-${backupId}.cfg`, printerConfig);
  backups.push(`printer-${backupId}.cfg`);
  if (existing !== null) {
    const backup = backupName(item.remote);
    await uploadMoonrakerConfigFile(backup, existing);
    backups.push(backup);
  }

  await uploadMoonrakerConfigFile(item.remote, source);
  const includeExists = printerConfig.split(/\r?\n/).some((line) => line.trim().toLowerCase() === item.include.toLowerCase());
  const updatedPrinterConfig = includeExists
    ? printerConfig
    : `${printerConfig.trimEnd()}\n\n${item.include}\n`;
  if (updatedPrinterConfig !== printerConfig) await uploadMoonrakerConfigFile("printer.cfg", updatedPrinterConfig);

  return { installed: true, current: true, remotePath: item.remote, backups, restartRequired: true };
}
