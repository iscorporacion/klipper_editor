import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isBlockedPath, resolveIncludePath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

type MacroEntry = {
  name: string;
  title: string;
  path: string;
  line: number;
};

const maxDepth = 12;
const rootConfigPath = "printer.cfg";

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

function getIncludesFromContent(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*\[include\s+([^\]]+)\]/i)?.[1]?.trim())
    .filter((includePath): includePath is string => Boolean(includePath));
}

async function expandInclude(fromFile: string, includePath: string) {
  const resolved = resolveIncludePath(fromFile, includePath);
  if (isBlockedPath(resolved)) return [];

  if (!resolved.includes("*")) {
    const absolutePath = resolveWorkspacePath(resolved);
    const stat = await fs.stat(absolutePath);
    return stat.isFile() ? [resolved] : [];
  }

  const directory = path.posix.dirname(resolved);
  const pattern = path.posix.basename(resolved).replace(/\./g, "\\.").replace(/\*/g, ".*");
  const matcher = new RegExp(`^${pattern}$`);
  const absoluteDirectory = resolveWorkspacePath(directory);
  const dirents = await fs.readdir(absoluteDirectory, { withFileTypes: true });

  return dirents
    .filter((dirent) => dirent.isFile() && matcher.test(dirent.name))
    .map((dirent) => path.posix.join(directory, dirent.name))
    .filter((relativePath) => !isBlockedPath(relativePath))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function collectActiveConfigFiles() {
  const files: string[] = [];
  const visited = new Set<string>();

  async function visit(relativePath: string, depth: number) {
    const cleanPath = toRelativePath(relativePath);
    if (depth > maxDepth || visited.has(cleanPath) || isBlockedPath(cleanPath)) return;

    visited.add(cleanPath);
    files.push(cleanPath);

    const content = await fs.readFile(resolveWorkspacePath(cleanPath), "utf8");
    for (const includePath of getIncludesFromContent(content)) {
      try {
        const matches = await expandInclude(cleanPath, includePath);
        for (const match of matches) {
          await visit(match, depth + 1);
        }
      } catch {
        // Missing optional includes should not hide macros from valid active files.
      }
    }
  }

  await visit(rootConfigPath, 0);
  return files;
}

export async function GET() {
  try {
    const files = await collectActiveConfigFiles();
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
