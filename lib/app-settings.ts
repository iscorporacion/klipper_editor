import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_ROOT } from "@/lib/workspace";

export type AppSettings = {
  terminalEnabled?: boolean;
};

const settingsPath = path.join(WORKSPACE_ROOT, ".klipper-editor-settings.json");

function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    terminalEnabled: typeof record.terminalEnabled === "boolean" ? record.terminalEnabled : undefined
  };
}

export function readAppSettingsSync(): AppSettings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    return {};
  }
}

export async function readAppSettings(): Promise<AppSettings> {
  try {
    return normalizeSettings(JSON.parse(await fsp.readFile(settingsPath, "utf8")));
  } catch {
    return {};
  }
}

export async function writeAppSettings(settings: AppSettings) {
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(settingsPath, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, "utf8");
}
