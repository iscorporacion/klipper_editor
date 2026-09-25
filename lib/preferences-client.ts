const endpoint = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/preferences`;
let values: Record<string, string> = {};
let loaded: Promise<void> | undefined;
let queue = Promise.resolve();
let failed = false;
const pending: { values: Record<string, string>; previous: Record<string, string> }[] = [];

async function request(body?: unknown) {
  const response = await fetch(endpoint, body ? {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: false
  } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo guardar la configuracion");
  return data as { id: string; values: Record<string, string> };
}

export function initializePreferences() {
  return loaded ??= (async () => {
    let document = await request();
    const marker = `k-editor-preferences-migrated-${document.id}`;
    const legacy: Record<string, string> = {};
    try {
      if (!localStorage.getItem(marker)) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)!;
          if (keys.includes(key)) legacy[key] = localStorage.getItem(key)!;
        }
      }
    } catch { /* Server preferences work even when browser storage is unavailable. */ }
    if (Object.keys(legacy).length) document = await request({ values: legacy, migrate: true });
    values = document.values;
    try { localStorage.setItem(marker, "true"); } catch { /* Optional migration marker. */ }
  })().catch(error => { loaded = undefined; throw error; });
}

const keys = ["ratos-viewer-locale", "klipper-editor-create-backup-on-save", "klipper-editor-hide-backup-files", "klipper-editor-terminal-height", "klipper-editor-terminal-history", "klipper-editor-klipper-console-favorites", "klipper-editor-klipper-console-temperature-reports", "klipper-editor-macro-favorites", "klipper-editor-section-preview-delay", "klipper-editor-sidebar-collapsed", "klipper-editor-use-accent-logo", "klipper-editor-heater-cache", "klipper-editor-heater-colors", "klipper-editor-theme", "klipper-editor-home-widgets", "klipper-editor-home-grid-layout", "klipper-editor-sensors-show-endstops", "klipper-editor-sensors-hidden", "klipper-editor-mmu-last-import"];

function notify(error: string) { window.dispatchEvent(new CustomEvent("preferences-status", { detail: error })); }
export function hasPendingPreferences() { return pending.length > 0; }
export function retryPreferences() {
  queue = queue.then(async () => {
    while (pending.length) {
      try { await request(pending[0]); pending.shift(); }
      catch (error) { failed = true; notify(String(error)); return; }
    }
    failed = false;
    notify("");
  });
}
export const preferences = {
  getItem(key: string) { return values[key] ?? null; },
  setItem(key: string, value: string) {
    if (values[key] === value) return;
    const previous = values[key];
    values[key] = value;
    pending.push({ values: { [key]: value }, previous: previous === undefined ? {} : { [key]: previous } });
    if (!failed) retryPreferences();
  },
  removeItem(_key: string) { /* Invalid data is kept for diagnosis instead of silently deleting it. */ }
};
