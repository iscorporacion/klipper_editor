import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_DIR_NAME = "ratos-file-viewer";

function defaultWorkspaceRoot() {
  const printerDataConfig = path.join(os.homedir(), "printer_data", "config");
  if (fs.existsSync(printerDataConfig)) {
    return printerDataConfig;
  }

  return path.resolve(process.cwd(), "..");
}

export const WORKSPACE_ROOT = process.env.RATOS_VIEWER_ROOT
  ? path.resolve(process.env.RATOS_VIEWER_ROOT)
  : defaultWorkspaceRoot();

const blockedSegments = new Set([".git", ".next", "node_modules", APP_DIR_NAME]);

export function toRelativePath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function resolveWorkspacePath(relativePath = "") {
  const clean = toRelativePath(relativePath);
  const absolutePath = path.resolve(WORKSPACE_ROOT, clean);
  const rootWithSeparator = WORKSPACE_ROOT.endsWith(path.sep)
    ? WORKSPACE_ROOT
    : `${WORKSPACE_ROOT}${path.sep}`;

  if (absolutePath !== WORKSPACE_ROOT && !absolutePath.startsWith(rootWithSeparator)) {
    throw new Error("Path is outside the workspace");
  }

  return absolutePath;
}

export function isBlockedPath(relativePath: string) {
  return toRelativePath(relativePath)
    .split("/")
    .filter(Boolean)
    .some((segment) => blockedSegments.has(segment));
}

export function sortByDirectoryThenName<T extends { name: string; type: "file" | "directory" }>(
  entries: T[]
) {
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function resolveIncludePath(fromFile: string, includeValue: string) {
  const cleaned = includeValue.trim().replace(/^["']|["']$/g, "");
  const baseDirectory = path.posix.dirname(toRelativePath(fromFile));
  const normalized = path.posix.normalize(path.posix.join(baseDirectory, cleaned));
  return normalized === "." ? cleaned : normalized;
}
