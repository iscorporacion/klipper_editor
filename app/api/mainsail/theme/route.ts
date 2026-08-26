import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getMainsailUiSettings } from "@/lib/moonraker";
import { resolveWorkspacePath, toRelativePath } from "@/lib/workspace";

const fallbackTheme = {
  mode: "dark",
  theme: "mainsail",
  logo: "#D41216",
  primary: "#2196f3",
  logoPath: null as string | null
};

async function firstExistingThemeLogo(mode: string) {
  const modeCandidates =
    mode === "light"
      ? ["sidebar-logo-light.svg", "sidebar-logo-light.png", "sidebar-logo-light.webp"]
      : ["sidebar-logo-dark.svg", "sidebar-logo-dark.png", "sidebar-logo-dark.webp"];

  const candidates = [
    ...modeCandidates,
    "sidebar-logo.svg",
    "sidebar-logo.png",
    "sidebar-logo.webp",
    "sidebar-logo.jpg",
    "sidebar-logo.jpeg"
  ];

  for (const candidate of candidates) {
    const relativePath = toRelativePath(`.theme/${candidate}`);

    try {
      const stat = await fs.stat(resolveWorkspacePath(relativePath));
      if (stat.isFile()) return relativePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  return null;
}

export async function GET() {
  try {
    const settings = await getMainsailUiSettings();
    const logoPath = await firstExistingThemeLogo(settings.mode);

    return NextResponse.json({
      ...settings,
      logoPath
    });
  } catch (error) {
    return NextResponse.json({
      ...fallbackTheme,
      error: error instanceof Error ? error.message : "Unable to load Mainsail theme"
    });
  }
}
