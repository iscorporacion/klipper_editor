import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isBlockedPath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

function quoteFilename(name: string) {
  return name.replace(/["\\]/g, "_");
}

function imageContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  };

  return types[extension];
}

export async function GET(request: NextRequest) {
  try {
    const relativePath = toRelativePath(request.nextUrl.searchParams.get("path") ?? "");
    const inline = request.nextUrl.searchParams.get("inline") === "1";

    if (!relativePath || isBlockedPath(relativePath)) {
      return NextResponse.json({ error: "Invalid download request" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(relativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    const content = await fs.readFile(absolutePath);
    const filename = quoteFilename(path.basename(relativePath));
    const contentType = inline ? imageContentType(relativePath) : undefined;

    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType ?? "application/octet-stream",
        "Content-Length": String(stat.size),
        "Content-Disposition": `${contentType ? "inline" : "attachment"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to download file" },
      { status: 500 }
    );
  }
}
