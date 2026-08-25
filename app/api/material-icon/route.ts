import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

type MaterialIconManifest = {
  file: string;
  iconDefinitions: Record<string, { iconPath: string }>;
};

const iconsDirectory = path.join(process.cwd(), "node_modules", "material-icon-theme", "icons");
const manifestPath = path.join(process.cwd(), "node_modules", "material-icon-theme", "dist", "material-icons.json");

let manifest: MaterialIconManifest | undefined;

async function getManifest() {
  if (!manifest) {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as MaterialIconManifest;
  }

  return manifest;
}

function cleanIconName(input: string) {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "");
}

async function resolveIconPath(iconName: string) {
  const materialIcons = await getManifest();
  const definition =
    materialIcons.iconDefinitions[iconName] ??
    materialIcons.iconDefinitions[materialIcons.file] ??
    materialIcons.iconDefinitions.file;
  const iconFile = path.basename(definition.iconPath);
  const absolutePath = path.resolve(iconsDirectory, iconFile);
  const iconsRoot = path.resolve(iconsDirectory);

  if (!absolutePath.startsWith(`${iconsRoot}${path.sep}`)) {
    throw new Error("Invalid icon path");
  }

  return absolutePath;
}

export async function GET(request: NextRequest) {
  try {
    const iconName = cleanIconName(request.nextUrl.searchParams.get("name") ?? "file") || "file";
    const iconPath = await resolveIconPath(iconName);
    const svg = await fs.readFile(iconPath, "utf8");

    return new NextResponse(svg, {
      headers: {
        "Cache-Control": "public, max-age=86400",
        "Content-Type": "image/svg+xml; charset=utf-8"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load icon" },
      { status: 500 }
    );
  }
}
