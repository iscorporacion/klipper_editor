import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { WORKSPACE_ROOT, isBlockedPath, resolveWorkspacePath } from "@/lib/workspace";
import { BACKUP_DIRECTORY, BACKUP_RULES_FILE, isBackupPath, matchesBackupGlob } from "@/scripts/backup-paths.mjs";
import { backupDigest, BackupError, readBackupRules, serializeBackups } from "@/lib/backup-rules";

type Item = { path: string; type: "file" | "directory"; stamp: string; size: number };
export type BackupCandidate = { path: string; destination: string; type: "file" | "directory"; fingerprint: string; files: number; blockedReason: string };
const internal = (name: string) => name === BACKUP_RULES_FILE || name.startsWith(".klipper-editor-") || name.startsWith(".keditor-");

async function inventory() {
  const items: Item[] = [];
  const warnings: string[] = [];
  async function walk(relative = "", depth = 0) {
    if (depth > 16 || items.length > 20000) throw new BackupError("Demasiados archivos para revisar de forma segura. Reduce el alcance antes de continuar.", 409);
    for (const dirent of await fs.readdir(resolveWorkspacePath(relative), { withFileTypes: true })) {
      const child = [relative, dirent.name].filter(Boolean).join("/");
      if (isBlockedPath(child) || dirent.name === BACKUP_DIRECTORY || internal(dirent.name)) continue;
      const stat = await fs.lstat(resolveWorkspacePath(child));
      if (stat.isSymbolicLink()) { warnings.push(`Enlace omitido: ${child}`); continue; }
      if (!stat.isFile() && !stat.isDirectory()) continue;
      items.push({ path: child, type: stat.isDirectory() ? "directory" : "file", size: stat.size,
        stamp: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` });
      if (stat.isDirectory()) await walk(child, depth + 1);
    }
  }
  await walk();
  return { items, warnings };
}

async function activeFiles(items: Item[]) {
  const active = new Set(["printer.cfg", "moonraker.conf"]);
  const contents: string[] = [];
  const files = new Set(items.filter((item) => item.type === "file").map((item) => item.path));
  if (!files.has("printer.cfg")) throw new BackupError("No se encontro printer.cfg; no se puede verificar que las copias esten fuera de la configuracion activa.", 409);
  const queue = ["printer.cfg"];
  const visited = new Set<string>();
  while (queue.length) {
    const relative = queue.pop()!;
    if (visited.has(relative)) continue;
    visited.add(relative);
    if (visited.size > 1000) throw new BackupError("Demasiados includes para revisar de forma segura", 409);
    const text = await fs.readFile(resolveWorkspacePath(relative), "utf8");
    if (text.length > 2_000_000) throw new BackupError("Archivo activo demasiado grande para revisar", 409);
    contents.push(`${relative}\n${text}`);
    let section = "";
    for (const line of text.split(/\r?\n/)) {
      const header = /^\s*\[([^\]]+)\]/.exec(line);
      if (header) section = header[1].toLowerCase();
      const include = /^\s*\[include\s+([^\]]+)\]/i.exec(line);
      if (include) {
        const value = include[1].trim().replace(/^["']|["']$/g, "");
        const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(relative), value));
        if (normalized.startsWith("../") || value.startsWith("/") || value.includes("[") || isBlockedPath(normalized)) throw new BackupError(`Include fuera del alcance seguro: ${value}`, 409);
        if (!/[?*]/.test(normalized)) {
          active.add(normalized);
          if (files.has(normalized)) queue.push(normalized);
        } else {
          for (const file of files) {
            // Standard dated copies in a wildcard include are precisely what must be removed.
            // Custom patterns alone never authorize moving an otherwise active config.
            if (matchesBackupGlob(file, normalized, false) && !isBackupPath(file)) { active.add(file); queue.push(file); }
          }
        }
      }
      if (section === "save_variables") {
        const filename = /^\s*filename\s*[:=]\s*([^#;]+)/i.exec(line)?.[1].trim();
        if (filename) {
          const expanded = filename.startsWith("~/") ? path.join(os.homedir(), filename.slice(2)) : filename;
          const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(WORKSPACE_ROOT, expanded);
          const saved = path.relative(WORKSPACE_ROOT, absolute).replace(/\\/g, "/");
          if (saved && !saved.startsWith("../") && !path.isAbsolute(saved)) active.add(saved);
          else for (const file of files) {
            if (path.posix.basename(file) === path.basename(expanded) && !isBackupPath(file)) active.add(file);
          }
        }
      }
    }
  }
  return { active, digest: backupDigest(contents.sort().join("\n")) };
}

export async function previewBackupMigration() {
  const document = await readBackupRules();
  const { items, warnings } = await inventory();
  const { active, digest } = await activeFiles(items);
  const candidates: BackupCandidate[] = [];
  const groups: string[] = [];
  for (const item of items) {
    if (groups.some((directory) => item.path.startsWith(`${directory}/`)) || !isBackupPath(item.path, item.type, document.rules)) continue;
    if (item.type === "directory") groups.push(item.path);
    const members = items.filter((member) => member.path === item.path || member.path.startsWith(`${item.path}/`));
    const fingerprint = backupDigest(JSON.stringify({ revision: document.revision, active: digest,
      members: members.map((member) => [member.path, member.stamp]).sort() }));
    const destination = `${BACKUP_DIRECTORY}/organized/${fingerprint.slice(0, 20)}/${item.path}.bak`;
    let blockedReason = [...active].some((file) => file === item.path || file.startsWith(`${item.path}/`))
      ? "Referenciado por la configuracion activa" : "";
    if (warnings.some((warning) => warning.startsWith(`Enlace omitido: ${item.path}/`))) blockedReason = "Contiene enlaces simbolicos; traslado manual requerido";
    try { await fs.lstat(resolveWorkspacePath(destination)); blockedReason = "El destino ya existe; no se sobrescribira"; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await fs.lstat(resolveWorkspacePath(`${BACKUP_DIRECTORY}/organized/${fingerprint.slice(0, 20)}`)); blockedReason ||= "Destino reservado por un traslado anterior; revision manual requerida"; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    candidates.push({ path: item.path, destination, fingerprint, type: item.type,
      files: members.filter((member) => member.type === "file").length, blockedReason });
  }
  return { revision: document.revision, candidates, warnings };
}

async function assertNoLinks(relative: string) {
  let current = WORKSPACE_ROOT;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new BackupError("No se trasladan enlaces simbolicos", 409);
  }
}

export function migrateBackups(input: unknown, revision: unknown) {
  return processBackups(input, revision, false);
}

export function deleteBackups(input: unknown, revision: unknown) {
  return processBackups(input, revision, true);
}

function processBackups(input: unknown, revision: unknown, deleting: boolean) {
  return serializeBackups(async () => {
    if (!Array.isArray(input) || !input.length || input.length > 500) throw new BackupError("Selecciona entre 1 y 500 copias");
    const plan = await previewBackupMigration();
    if (revision !== plan.revision) throw new BackupError("Las reglas cambiaron. Genera una vista previa nueva.", 409);
    const selected: BackupCandidate[] = [];
    for (const value of input) {
      const item = plan.candidates.find((candidate) => candidate.path === value?.path);
      if (!item || item.blockedReason || item.fingerprint !== value?.fingerprint || selected.some((candidate) => candidate.path === item.path)) {
        throw new BackupError("La seleccion cambio o incluye un archivo protegido. Revisa la vista previa de nuevo.", 409);
      }
      selected.push(item);
    }
    const moved: { path: string; destination: string }[] = [];
    const deleted: string[] = [];
    const errors: { path: string; error: string }[] = [];
    for (const item of selected) {
      try {
        const current = (await previewBackupMigration()).candidates.find((candidate) => candidate.path === item.path);
        if (!current || current.blockedReason || current.fingerprint !== item.fingerprint) throw new BackupError("La copia o la configuracion activa cambiaron durante el traslado", 409);
        const source = resolveWorkspacePath(item.path);
        const destination = resolveWorkspacePath(item.destination);
        if (source === WORKSPACE_ROOT || !item.destination.startsWith(`${BACKUP_DIRECTORY}/organized/`)) throw new BackupError("Destino invalido");
        await assertNoLinks(item.path);
        if (deleting) {
          const relative = path.relative(WORKSPACE_ROOT, source);
          if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new BackupError("Ruta de borrado invalida");
          if (item.type === "directory") await fs.rm(source, { recursive: true, force: false });
          else await fs.unlink(source);
          deleted.push(item.path);
          continue;
        }
        let directory = "";
        for (const [index, part] of item.destination.split("/").slice(0, -1).entries()) {
          directory = [directory, part].filter(Boolean).join("/");
          try { await fs.mkdir(resolveWorkspacePath(directory), { mode: 0o700 }); }
          catch (error) { if (index === 2 || (error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
          await assertNoLinks(directory);
        }
        try { await fs.lstat(destination); throw new BackupError("El destino ya existe"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (item.type === "file") {
          await fs.link(source, destination);
          await fs.unlink(source);
        } else {
          await fs.rename(source, destination);
        }
        moved.push({ path: item.path, destination: item.destination });
      } catch (error) {
        errors.push({ path: item.path, error: error instanceof Error ? error.message : "No se pudo trasladar" });
      }
    }
    return { moved, deleted, errors };
  });
}
