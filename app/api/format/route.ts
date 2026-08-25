import prettier from "prettier";
import { NextRequest, NextResponse } from "next/server";
import { isBlockedPath, resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

function parserForPath(relativePath: string) {
  const lowerPath = relativePath.toLowerCase();
  const extension = lowerPath.split(".").at(-1) ?? "";

  if (["js", "jsx", "mjs", "cjs"].includes(extension)) return "babel";
  if (["ts", "tsx", "mts", "cts"].includes(extension)) return "typescript";
  if (extension === "json") return "json";
  if (extension === "jsonc") return "jsonc";
  if (["yaml", "yml"].includes(extension)) return "yaml";
  if (["md", "markdown"].includes(extension)) return "markdown";
  if (["html", "htm"].includes(extension)) return "html";
  if (extension === "css") return "css";
  if (extension === "scss") return "scss";
  if (extension === "less") return "less";

  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { path?: string; content?: string };
    const relativePath = toRelativePath(body.path ?? "");

    if (!relativePath || isBlockedPath(relativePath) || typeof body.content !== "string") {
      return NextResponse.json({ error: "Solicitud de formato invalida" }, { status: 400 });
    }

    const parser = parserForPath(relativePath);
    if (!parser) {
      return NextResponse.json({ error: "Prettier no soporta este tipo de archivo" }, { status: 400 });
    }

    const absolutePath = resolveWorkspacePath(relativePath);
    const config = await prettier.resolveConfig(absolutePath).catch(() => null);
    const formatted = await prettier.format(body.content, {
      ...config,
      filepath: absolutePath,
      parser
    });

    return NextResponse.json({ formatted, parser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo formatear" },
      { status: 500 }
    );
  }
}
