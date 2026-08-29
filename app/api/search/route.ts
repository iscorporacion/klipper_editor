import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isBlockedPath, resolveWorkspacePath, sortByDirectoryThenName, toRelativePath } from "@/lib/workspace";

type SearchResult = {
  path: string;
  line: number;
  text: string;
};

const maxDepth = 12;
const maxFileSize = 1_500_000;
const maxResults = 250;
const searchableExtensions = new Set([
  ".cfg",
  ".conf",
  ".ini",
  ".inc",
  ".macro",
  ".gcode",
  ".txt",
  ".md",
  ".sh",
  ".json",
  ".yaml",
  ".yml"
]);

function isBackupName(name: string) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".bak") ||
    lower.includes(".bak.") ||
    /\b\d{8}[_-]\d{6}\b/.test(lower) ||
    /^config-\d{8}-\d{6}\.zip$/.test(lower)
  );
}

function isSearchableFile(relativePath: string) {
  const name = path.posix.basename(relativePath);
  if (isBackupName(name)) return false;
  return searchableExtensions.has(path.posix.extname(name).toLowerCase());
}

async function collectFiles(relativePath = "", depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];

  const absolutePath = resolveWorkspacePath(relativePath);
  const dirents = await fs.readdir(absolutePath, { withFileTypes: true });
  const files: string[] = [];

  for (const dirent of dirents) {
    const childRelativePath = toRelativePath(path.posix.join(relativePath, dirent.name));
    if (isBlockedPath(childRelativePath)) continue;

    if (dirent.isDirectory()) {
      files.push(...await collectFiles(childRelativePath, depth + 1));
    } else if (dirent.isFile() && isSearchableFile(childRelativePath)) {
      files.push(childRelativePath);
    }
  }

  return files;
}

async function searchFile(relativePath: string, query: string): Promise<SearchResult[]> {
  const absolutePath = resolveWorkspacePath(relativePath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || stat.size > maxFileSize) return [];

  const content = await fs.readFile(absolutePath, "utf8");
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  content.split(/\r?\n/).forEach((line, index) => {
    if (line.toLowerCase().includes(lowerQuery)) {
      results.push({
        path: relativePath,
        line: index + 1,
        text: line.trim()
      });
    }
  });

  return results;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const files = await collectFiles();
    const sortedFiles = sortByDirectoryThenName(files.map((file) => ({ name: path.posix.basename(file), path: file, type: "file" as const })));
    const results: SearchResult[] = [];

    for (const file of sortedFiles) {
      results.push(...await searchFile(file.path, query));
      if (results.length >= maxResults) break;
    }

    return NextResponse.json({ results: results.slice(0, maxResults) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to search configuration" },
      { status: 500 }
    );
  }
}
