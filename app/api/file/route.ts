import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isBlockedPath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  const relativePath = toRelativePath(request.nextUrl.searchParams.get("path") ?? "");

  try {
    if (!relativePath || isBlockedPath(relativePath)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(relativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    const content = await fs.readFile(absolutePath, "utf8");
    return NextResponse.json({
      path: relativePath,
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read file" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { path?: string; content?: string };
    const relativePath = toRelativePath(body.path ?? "");

    if (!relativePath || isBlockedPath(relativePath) || typeof body.content !== "string") {
      return NextResponse.json({ error: "Invalid save request" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(relativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    await fs.writeFile(absolutePath, body.content, "utf8");
    const updatedStat = await fs.stat(absolutePath);

    return NextResponse.json({
      path: relativePath,
      modifiedAt: updatedStat.mtime.toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save file" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { path?: string; content?: string };
    const relativePath = toRelativePath(body.path ?? "");
    const content = body.content ?? "";

    if (!relativePath || isBlockedPath(relativePath) || typeof content !== "string") {
      return NextResponse.json({ error: "Invalid create request" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(relativePath);

    try {
      await fs.stat(absolutePath);
      return NextResponse.json({ error: "File already exists" }, { status: 409 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
    const stat = await fs.stat(absolutePath);

    return NextResponse.json({
      path: relativePath,
      modifiedAt: stat.mtime.toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create file" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const relativePath = toRelativePath(request.nextUrl.searchParams.get("path") ?? "");

    if (!relativePath || isBlockedPath(relativePath)) {
      return NextResponse.json({ error: "Invalid delete request" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(relativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    await fs.unlink(absolutePath);
    return NextResponse.json({ path: relativePath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete file" },
      { status: 500 }
    );
  }
}
