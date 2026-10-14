import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { WORKSPACE_ROOT } from "@/lib/workspace";
import { BACKUP_RULES_FILE, defaultBackupRules } from "@/scripts/backup-paths.mjs";
import { createConfigBackup } from "@/scripts/config-backups.mjs";

export type BackupRule = { id: string; pattern: string; kind: "file" | "directory" | "both"; enabled: boolean };
export class BackupError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const backupDigest = (value: string) => createHash("sha256").update(value).digest("hex");
const filename = path.join(WORKSPACE_ROOT, BACKUP_RULES_FILE);

export function validateBackupRules(input: unknown): BackupRule[] {
  if (!Array.isArray(input) || input.length > 100) throw new BackupError("Maximo 100 patrones");
  const ids = new Set<string>();
  return input.map((rule) => {
    if (!rule || typeof rule.id !== "string" || !/^[\w-]{1,80}$/.test(rule.id) || ids.has(rule.id)) throw new BackupError("Identificador de patron invalido");
    ids.add(rule.id);
    const pattern = typeof rule.pattern === "string" ? rule.pattern.trim().replace(/\\/g, "/") : "";
    if (!pattern || pattern.length > 160 || !/[a-zA-Z0-9~_-]/.test(pattern) || /[\x00-\x1f:\[\]{}]/.test(pattern) || pattern.split("/").some((part: string) => !part || part === "." || part === "..")) throw new BackupError("Patron invalido: usa nombres relativos con * o ?");
    if (!["file", "directory", "both"].includes(rule.kind) || typeof rule.enabled !== "boolean") throw new BackupError("Tipo de patron invalido");
    return { id: rule.id, pattern, kind: rule.kind, enabled: rule.enabled };
  });
}

export async function readBackupRules() {
  try {
    const text = await fs.readFile(filename, "utf8");
    const document = JSON.parse(text);
    if (document.version !== 1) throw new Error("Unsupported backup rules version");
    return { rules: validateBackupRules(document.rules), revision: backupDigest(text) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rules: validateBackupRules(defaultBackupRules), revision: "default" };
    throw new BackupError("No se pudo leer .keditor-backup-rules.json. Se conserva el archivo; revisalo antes de continuar.", 409);
  }
}

const shared = globalThis as typeof globalThis & { backupRulesQueue?: Promise<unknown> };
export function serializeBackups<T>(operation: () => Promise<T>): Promise<T> {
  const next = (shared.backupRulesQueue ?? Promise.resolve()).then(operation);
  shared.backupRulesQueue = next.catch(() => {});
  return next;
}

export function saveBackupRules(input: unknown, revision: unknown) {
  return serializeBackups(async () => {
    const rules = validateBackupRules(input);
    const current = await readBackupRules();
    if (revision !== current.revision) throw new BackupError("Las reglas cambiaron. Recarga antes de guardar.", 409);
    const temporary = `${filename}.${randomUUID()}.tmp`;
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify({ version: 1, rules }, null, 2) + "\n"); await handle.sync(); }
      finally { await handle.close(); }
      if (current.revision !== "default") {
        const stat = await fs.lstat(filename);
        if (stat.isSymbolicLink()) throw new BackupError("El archivo de reglas no puede ser un enlace simbolico");
        await createConfigBackup(WORKSPACE_ROOT, filename);
      }
      await fs.rename(temporary, filename);
    } finally { await fs.unlink(temporary).catch(() => {}); }
    return readBackupRules();
  });
}
