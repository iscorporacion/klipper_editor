import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const sourcePath = path.join(process.cwd(), "public", "img", "carrete.svg");
const materialPaths = /<g fill="#FFFFFF" fill-opacity="0\.82" transform="matrix\(1 -0\.017 0\.017 1 281\.612 139\.624\)">[\s\S]*?<\/g>/;

function xmlText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"
  })[character] ?? "");
}

export async function GET(request: NextRequest) {
  const requestedColor = request.nextUrl.searchParams.get("color")?.replace(/^#/, "") ?? "808182";
  const color = /^[0-9a-f]{6}$/i.test(requestedColor) ? `#${requestedColor.toUpperCase()}` : "#808182";
  const material = xmlText((request.nextUrl.searchParams.get("material") || "").trim().slice(0, 16).toUpperCase());
  const empty = request.nextUrl.searchParams.get("empty") === "1";
  const fontSize = Math.max(24, Math.min(58, Math.floor(210 / Math.max(material.length * 0.62, 1))));

  let svg = await readFile(sourcePath, "utf8");
  if (!materialPaths.test(svg)) {
    return NextResponse.json({ error: "The spool SVG material layer was not found" }, { status: 500 });
  }

  svg = svg
    .replace(/<\?xml[^>]*>\s*/i, "")
    .replace(/\s*<rect width="601\.826" height="690" fill="#FFFFFF" fill-rule="evenodd" \/>/, "")
    .replace(/fill="#E81010"/gi, `fill="#E81010"${empty ? ` fill-opacity="0"` : ""}`)
    .replace(/stroke="#E81010"/gi, `stroke="#E81010"${empty ? ` stroke-opacity="0"` : ""}`)
    .replace(/#E81010/gi, color)
    .replace(materialPaths, material ? `<g transform="matrix(1 -0.017 0.017 1 281.612 139.624)">
      <text x="94" y="58" fill="#FFFFFF" fill-opacity="0.88" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle">${material}</text>
    </g>` : `<g transform="matrix(1 -0.017 0.017 1 281.612 139.624)"></g>`);
  if (empty) svg = svg.replace(/stroke-opacity="0\.341"/g, `stroke-opacity="0"`);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
