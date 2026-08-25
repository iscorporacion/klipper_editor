import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isBlockedPath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const targetPath = toRelativePath(String(formData.get("path") ?? ""));

    if (!(file instanceof File) || !targetPath || isBlockedPath(targetPath)) {
      return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(targetPath);

    try {
      await fs.stat(absolutePath);
      return NextResponse.json({ error: "File already exists" }, { status: 409 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    const stat = await fs.stat(absolutePath);

    return NextResponse.json({
      path: targetPath,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload file" },
      { status: 500 }
    );
  }
}
