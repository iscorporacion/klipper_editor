import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isBlockedPath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

function timestampForBackup(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

async function backupPathForFile(absolutePath: string) {
  const parsed = path.parse(absolutePath);
  const timestamp = timestampForBackup();
  let candidate = path.join(parsed.dir, `${parsed.name}-${timestamp}${parsed.ext}`);
  let suffix = 1;

  while (true) {
    try {
      await fs.stat(candidate);
      candidate = path.join(parsed.dir, `${parsed.name}-${timestamp}-${suffix}${parsed.ext}`);
      suffix += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
      throw error;
    }
  }
}

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
    const body = (await request.json()) as { path?: string; content?: string; createBackup?: boolean };
    const relativePath = toRelativePath(body.path ?? "");

    if (!relativePath || isBlockedPath(relativePath) || typeof body.content !== "string") {
      return NextResponse.json({ error: "Invalid save request" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(relativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    let backupPath: string | undefined;
    if (body.createBackup) {
      backupPath = await backupPathForFile(absolutePath);
      await fs.copyFile(absolutePath, backupPath);
    }

    await fs.writeFile(absolutePath, body.content, "utf8");
    const updatedStat = await fs.stat(absolutePath);

    return NextResponse.json({
      path: relativePath,
      backupPath: backupPath ? toRelativePath(path.relative(resolveWorkspacePath(), backupPath)) : undefined,
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

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { path?: string; newPath?: string };
    const relativePath = toRelativePath(body.path ?? "");
    const newRelativePath = toRelativePath(body.newPath ?? "");

    if (
      !relativePath ||
      !newRelativePath ||
      isBlockedPath(relativePath) ||
      isBlockedPath(newRelativePath) ||
      relativePath === newRelativePath
    ) {
      return NextResponse.json({ error: "Invalid rename request" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(relativePath);
    const newAbsolutePath = resolveWorkspacePath(newRelativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    try {
      await fs.stat(newAbsolutePath);
      return NextResponse.json({ error: "Target file already exists" }, { status: 409 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await fs.mkdir(path.dirname(newAbsolutePath), { recursive: true });
    await fs.rename(absolutePath, newAbsolutePath);
    const updatedStat = await fs.stat(newAbsolutePath);

    return NextResponse.json({
      path: relativePath,
      newPath: newRelativePath,
      modifiedAt: updatedStat.mtime.toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to rename file" },
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
