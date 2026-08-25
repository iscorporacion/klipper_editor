import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isBlockedPath, resolveWorkspacePath, sortByDirectoryThenName, toRelativePath } from "@/lib/workspace";

type MacroEntry = {
  name: string;
  title: string;
  path: string;
  line: number;
};

type ScanEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
};

const maxDepth = 12;
const configFilePattern = /\.(cfg|conf|ini)$/i;

async function scanConfigFiles(relativePath = "", depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];

  const absolutePath = resolveWorkspacePath(relativePath);
  const dirents = await fs.readdir(absolutePath, { withFileTypes: true });
  const entries: ScanEntry[] = [];

  for (const dirent of dirents) {
    const childRelativePath = toRelativePath(path.posix.join(relativePath, dirent.name));
    if (isBlockedPath(childRelativePath)) continue;

    if (dirent.isDirectory()) {
      entries.push({ name: dirent.name, path: childRelativePath, type: "directory" });
    } else if (dirent.isFile() && configFilePattern.test(dirent.name)) {
      entries.push({ name: dirent.name, path: childRelativePath, type: "file" });
    }
  }

  const files: string[] = [];
  for (const entry of sortByDirectoryThenName(entries)) {
    if (entry.type === "directory") {
      files.push(...(await scanConfigFiles(entry.path, depth + 1)));
    } else {
      files.push(entry.path);
    }
  }

  return files;
}

function getMacrosFromContent(relativePath: string, content: string): MacroEntry[] {
  return content
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s*\[gcode_macro\s+([^\]]+)\]/i);
      if (!match) return undefined;

      const name = match[1].trim();
      return {
        name,
        title: `[gcode_macro ${name}]`,
        path: relativePath,
        line: index + 1
      };
    })
    .filter((macro): macro is MacroEntry => Boolean(macro));
}

export async function GET() {
  try {
    const files = await scanConfigFiles();
    const macros: MacroEntry[] = [];

    for (const file of files) {
      const absolutePath = resolveWorkspacePath(file);
      const content = await fs.readFile(absolutePath, "utf8");
      macros.push(...getMacrosFromContent(file, content));
    }

    macros.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return NextResponse.json({ macros });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read macros" },
      { status: 500 }
    );
  }
}
