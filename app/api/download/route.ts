import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isBlockedPath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

function quoteFilename(name: string) {
  return name.replace(/["\\]/g, "_");
}

export async function GET(request: NextRequest) {
  try {
    const relativePath = toRelativePath(request.nextUrl.searchParams.get("path") ?? "");

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

    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to download file" },
      { status: 500 }
    );
  }
}
