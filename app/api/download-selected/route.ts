import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { zipSync } from "fflate";
import { isBlockedPath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

function quoteFilename(name: string) {
  return name.replace(/["\\]/g, "_");
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { paths?: unknown };
    const paths = Array.isArray(payload.paths)
      ? payload.paths.map((filePath) => toRelativePath(String(filePath))).filter(Boolean)
      : [];

    const uniquePaths = Array.from(new Set(paths));
    if (uniquePaths.length === 0 || uniquePaths.some((filePath) => isBlockedPath(filePath))) {
      return NextResponse.json({ error: "Invalid download request" }, { status: 400 });
    }

    if (uniquePaths.length === 1) {
      const relativePath = uniquePaths[0];
      const absolutePath = resolveWorkspacePath(relativePath);
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
      }

      const content = await fs.readFile(absolutePath);
      const filename = quoteFilename(path.basename(relativePath));
      return new NextResponse(content, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(stat.size),
          "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        }
      });
    }

    const entries: Record<string, Uint8Array> = {};
    for (const relativePath of uniquePaths) {
      const absolutePath = resolveWorkspacePath(relativePath);
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) continue;
      entries[relativePath] = await fs.readFile(absolutePath);
    }

    if (Object.keys(entries).length === 0) {
      return NextResponse.json({ error: "No files to download" }, { status: 400 });
    }

    const zip = zipSync(entries);
    const filename = "klipper-editor-selected-files.zip";
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to download selected files" },
      { status: 500 }
    );
  }
}
