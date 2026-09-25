import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WORKSPACE_ROOT } from "@/lib/workspace";

export const preferenceKeys = [
  "ratos-viewer-locale", "klipper-editor-create-backup-on-save",
  "klipper-editor-hide-backup-files", "klipper-editor-terminal-height",
  "klipper-editor-terminal-history", "klipper-editor-klipper-console-favorites", "klipper-editor-klipper-console-temperature-reports",
  "klipper-editor-macro-favorites", "klipper-editor-section-preview-delay",
  "klipper-editor-sidebar-collapsed", "klipper-editor-use-accent-logo",
  "klipper-editor-heater-cache", "klipper-editor-heater-colors",
  "klipper-editor-theme", "klipper-editor-home-widgets", "klipper-editor-home-grid-layout",
  "klipper-editor-sensors-show-endstops", "klipper-editor-sensors-hidden",
  "klipper-editor-mmu-last-import"
];
type Document = { id: string; values: Record<string, string> };
const filename = path.join(WORKSPACE_ROOT, ".klipper-editor-preferences.json");
const shared = globalThis as typeof globalThis & { preferencesQueue?: Promise<unknown> };

async function read(): Promise<Document> {
  try {
    const value = JSON.parse(await fs.readFile(filename, "utf8"));
    if (!value.id || !value.values || typeof value.values !== "object") throw new Error("Invalid preferences file");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { id: randomUUID(), values: {} };
    throw new Error("No se pudo leer la configuracion. Se conserva el archivo y su respaldo.");
  }
}

async function save(document: Document) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(document, null, 2) + "\n", "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    try { await fs.copyFile(filename, `${filename}.bak`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await fs.rename(temporary, filename);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = (shared.preferencesQueue ?? Promise.resolve()).then(operation);
  shared.preferencesQueue = next.catch(() => {});
  return next;
}

function validate(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    if (!preferenceKeys.includes(key) || typeof value !== "string" || value.length > 500000)
      throw new Error("Invalid preference");
  }
}

export function getPreferences() {
  return serialized(async () => {
    const document = await read();
    try { await fs.access(filename); } catch { await save(document); }
    return document;
  });
}

export function updatePreferences(values: Record<string, string>, previous: Record<string, string> = {}, migrate = false) {
  return serialized(async () => {
    validate(values);
    const document = await read();
    for (const [key, value] of Object.entries(values)) {
      const isList = key.endsWith("-favorites") || key.endsWith("-history");
      if (isList) {
        const incoming = JSON.parse(value) as unknown[];
        const current = JSON.parse(document.values[key] ?? "[]") as unknown[];
        const before = JSON.parse(previous[key] ?? "[]") as unknown[];
        if (![incoming, current, before].every(Array.isArray)) throw new Error("Invalid preference list");
        const identity = (item: unknown) => typeof item === "string" ? item : JSON.stringify((item as { script?: string })?.script);
        const incomingIds = new Set(incoming.map(identity));
        const removed = new Set(migrate ? [] : before.map(identity).filter(id => !incomingIds.has(id)));
        const combined = new Map(current.filter(item => !removed.has(identity(item))).map(item => [identity(item), item]));
        const beforeItems = new Map(before.map(item => [identity(item), JSON.stringify(item)]));
        for (const item of incoming) {
          if (migrate || beforeItems.get(identity(item)) !== JSON.stringify(item)) combined.set(identity(item), item);
        }
        document.values[key] = JSON.stringify([...combined.values()]);
      } else if (!migrate || document.values[key] === undefined) document.values[key] = value;
    }
    await save(document);
    return document;
  });
}
