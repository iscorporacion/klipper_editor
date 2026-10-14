import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { BACKUP_DIRECTORY, isBackupPath } from "@/scripts/backup-paths.mjs";
import { readBackupRules, validateBackupRules, type BackupRule } from "@/lib/backup-rules";
import { defaultBackupRules } from "@/scripts/backup-paths.mjs";
import {
  isBlockedPath,
  resolveWorkspacePath,
  sortByDirectoryThenName,
  toRelativePath,
  WORKSPACE_ROOT
} from "@/lib/workspace";

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  icon?: string;
  openIcon?: string;
  backup?: boolean;
};

const maxDepth = 12;
const materialIconManifestPath = path.join(process.cwd(), "node_modules", "material-icon-theme", "dist", "material-icons.json");

type MaterialIconManifest = {
  file: string;
  folder: string;
  folderExpanded: string;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
};

let materialIconManifest: MaterialIconManifest | undefined;

async function getMaterialIconManifest() {
  if (!materialIconManifest) {
    materialIconManifest = JSON.parse(await fs.readFile(materialIconManifestPath, "utf8")) as MaterialIconManifest;
  }

  return materialIconManifest;
}

function fileIconFor(name: string, manifest: MaterialIconManifest) {
  const lowerName = name.toLowerCase();
  const parts = lowerName.split(".").filter(Boolean);
  const fullExtension = parts.length > 1 ? parts.slice(1).join(".") : "";
  const extension = parts.at(-1) ?? "";

  return (
    manifest.fileNames[lowerName] ??
    manifest.fileExtensions[fullExtension] ??
    manifest.fileExtensions[extension] ??
    manifest.file
  );
}

function folderIconFor(name: string, manifest: MaterialIconManifest, expanded: boolean) {
  const lowerName = name.toLowerCase();
  if (lowerName === BACKUP_DIRECTORY) return expanded ? "folder-backup-open" : "folder-backup";
  if (expanded) {
    return manifest.folderNamesExpanded[lowerName] ?? manifest.folderExpanded;
  }

  return manifest.folderNames[lowerName] ?? manifest.folder;
}

async function readNode(
  manifest: MaterialIconManifest,
  relativePath = "",
  depth = 0,
  seenRealPaths = new Set<string>(),
  rules: BackupRule[] = []
): Promise<TreeNode[]> {
  if (depth > maxDepth) return [];

  const absolutePath = resolveWorkspacePath(relativePath);
  const realDirectoryPath = await fs.realpath(absolutePath).catch(() => absolutePath);
  if (seenRealPaths.has(realDirectoryPath)) return [];

  const nextSeenRealPaths = new Set(seenRealPaths);
  nextSeenRealPaths.add(realDirectoryPath);

  const dirents = await fs.readdir(absolutePath, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const dirent of dirents) {
    const childRelativePath = toRelativePath(path.posix.join(relativePath, dirent.name));
    if (isBlockedPath(childRelativePath)) continue;

    const childAbsolutePath = resolveWorkspacePath(childRelativePath);
    const childStat = dirent.isSymbolicLink()
      ? await fs.stat(childAbsolutePath).catch(() => undefined)
      : undefined;
    const isDirectory = dirent.isDirectory() || Boolean(childStat?.isDirectory());
    const isFile = dirent.isFile() || Boolean(childStat?.isFile());
    const backup = isBackupPath(childRelativePath, isDirectory ? "directory" : "file", rules);

    if (isDirectory) {
      nodes.push({
        name: dirent.name,
        path: childRelativePath,
        type: "directory",
        backup,
        icon: backup ? "folder-backup" : folderIconFor(dirent.name, manifest, false),
        openIcon: backup ? "folder-backup-open" : folderIconFor(dirent.name, manifest, true),
        children: await readNode(manifest, childRelativePath, depth + 1, nextSeenRealPaths, rules)
      });
    } else if (isFile) {
      nodes.push({
        name: dirent.name,
        path: childRelativePath,
        type: "file",
        backup,
        icon: backup ? "backup-file" : fileIconFor(dirent.name, manifest)
      });
    }
  }

  return sortByDirectoryThenName(nodes);
}

export async function GET() {
  try {
    const manifest = await getMaterialIconManifest();
    let backupRulesError: string | undefined;
    const document = await readBackupRules().catch((error) => {
      backupRulesError = error instanceof Error ? error.message : "Reglas de copias invalidas";
      return { rules: validateBackupRules(defaultBackupRules) };
    });
    const children = await readNode(manifest, "", 0, new Set(), document.rules);
    return NextResponse.json({
      root: WORKSPACE_ROOT,
      backupRulesError,
      children
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read tree" },
      { status: 500 }
    );
  }
}
