import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { backupRelativePath } from "./backup-paths.mjs";

/** @param {string} root @param {string} absolutePath */
export async function createConfigBackup(root, absolutePath) {
  const relative = path.relative(root, absolutePath).replace(/\\/g, "/");
  const backup = backupRelativePath(relative, randomUUID());
  let directory = root;
  // Refuse redirected backup directories rather than writing outside the config root.
  for (const part of backup.split("/").slice(0, -1)) {
    directory = path.join(directory, part);
    try { await fs.mkdir(directory); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Backup directory must not be a symbolic link");
  }
  await fs.copyFile(absolutePath, path.join(root, ...backup.split("/")), constants.COPYFILE_EXCL);
  return backup;
}
