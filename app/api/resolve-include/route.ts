import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isBlockedPath, resolveIncludePath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  const from = toRelativePath(request.nextUrl.searchParams.get("from") ?? "");
  const include = request.nextUrl.searchParams.get("include") ?? "";

  try {
    if (!from || !include) {
      return NextResponse.json({ error: "Missing include context" }, { status: 400 });
    }

    const resolved = resolveIncludePath(from, include);
    if (isBlockedPath(resolved)) {
      return NextResponse.json({ error: "Include path is blocked" }, { status: 400 });
    }

    if (resolved.includes("*")) {
      const directory = path.posix.dirname(resolved);
      const pattern = path.posix.basename(resolved).replace(/\./g, "\\.").replace(/\*/g, ".*");
      const matcher = new RegExp(`^${pattern}$`);
      const absoluteDirectory = resolveWorkspacePath(directory);
      const dirents = await fs.readdir(absoluteDirectory, { withFileTypes: true });
      const matches = dirents
        .filter((dirent) => dirent.isFile() && matcher.test(dirent.name))
        .map((dirent) => path.posix.join(directory, dirent.name))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

      return NextResponse.json({ path: matches[0] ?? null, matches });
    }

    const absolutePath = resolveWorkspacePath(resolved);
    const stat = await fs.stat(absolutePath);
    return NextResponse.json({
      path: stat.isFile() ? resolved : null,
      matches: stat.isFile() ? [resolved] : []
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to resolve include" },
      { status: 404 }
    );
  }
}
