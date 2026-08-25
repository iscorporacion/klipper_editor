import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

type LocaleFile = {
  meta?: {
    code?: string;
    name?: string;
  };
  messages?: Record<string, string>;
};

const localesDirectory = path.join(process.cwd(), "locales");

function safeLocaleCode(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, "");
}

async function readLocaleFile(fileName: string) {
  const filePath = path.join(localesDirectory, fileName);
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as LocaleFile;
}

export async function GET(request: NextRequest) {
  try {
    const requestedLocale = safeLocaleCode(request.nextUrl.searchParams.get("locale") ?? "");

    if (requestedLocale) {
      const locale = await readLocaleFile(`${requestedLocale}.json`);
      return NextResponse.json({
        code: requestedLocale,
        name: locale.meta?.name ?? requestedLocale,
        messages: locale.messages ?? {}
      });
    }

    const dirents = await fs.readdir(localesDirectory, { withFileTypes: true });
    const locales = await Promise.all(
      dirents
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".json"))
        .map(async (dirent) => {
          const code = path.basename(dirent.name, ".json");
          const locale = await readLocaleFile(dirent.name);

          return {
            code,
            name: locale.meta?.name ?? code
          };
        })
    );

    return NextResponse.json({
      locales: locales.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read locales" },
      { status: 500 }
    );
  }
}
