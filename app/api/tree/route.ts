import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
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
  if (expanded) {
    return manifest.folderNamesExpanded[lowerName] ?? manifest.folderExpanded;
  }

  return manifest.folderNames[lowerName] ?? manifest.folder;
}

async function readNode(
  manifest: MaterialIconManifest,
  relativePath = "",
  depth = 0,
  seenRealPaths = new Set<string>()
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

    if (isDirectory) {
      nodes.push({
        name: dirent.name,
        path: childRelativePath,
        type: "directory",
        icon: folderIconFor(dirent.name, manifest, false),
        openIcon: folderIconFor(dirent.name, manifest, true),
        children: await readNode(manifest, childRelativePath, depth + 1, nextSeenRealPaths)
      });
    } else if (isFile) {
      nodes.push({
        name: dirent.name,
        path: childRelativePath,
        type: "file",
        icon: fileIconFor(dirent.name, manifest)
      });
    }
  }

  return sortByDirectoryThenName(nodes);
}

export async function GET() {
  try {
    const manifest = await getMaterialIconManifest();
    const children = await readNode(manifest);
    return NextResponse.json({
      root: WORKSPACE_ROOT,
      children
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read tree" },
      { status: 500 }
    );
  }
}
