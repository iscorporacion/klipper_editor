import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { bundledLocaleOptions, bundledLocales } from "@/lib/locales";
import type { LocaleFile } from "@/lib/locales";

const localesDirectory = path.join(process.cwd(), "locales");

function safeLocaleCode(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, "");
}

async function readLocaleFile(fileName: string) {
  const filePath = path.join(localesDirectory, fileName);
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as LocaleFile;
}

async function readLocaleOrBundled(code: string) {
  try {
    return await readLocaleFile(`${code}.json`);
  } catch (error) {
    const locale = bundledLocales[code];
    if (locale) return locale;
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const requestedLocale = safeLocaleCode(request.nextUrl.searchParams.get("locale") ?? "");

    if (requestedLocale) {
      const locale = await readLocaleOrBundled(requestedLocale);
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
    const requestedLocale = safeLocaleCode(request.nextUrl.searchParams.get("locale") ?? "");
    const bundledLocale = requestedLocale ? bundledLocales[requestedLocale] : undefined;

    if (bundledLocale) {
      return NextResponse.json({
        code: requestedLocale,
        name: bundledLocale.meta?.name ?? requestedLocale,
        messages: bundledLocale.messages ?? {}
      });
    }

    return NextResponse.json({
      locales: bundledLocaleOptions(),
      warning: error instanceof Error ? error.message : "Unable to read locales"
    });
  }
}
