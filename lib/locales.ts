import enLocale from "@/locales/en.json";
import esLocale from "@/locales/es.json";

export type LocaleFile = {
  meta?: {
    code?: string;
    name?: string;
  };
  messages?: Record<string, string>;
};

export const bundledLocales: Record<string, LocaleFile> = {
  en: enLocale,
  es: esLocale
};

export function bundledLocaleOptions() {
  return Object.entries(bundledLocales)
    .map(([code, locale]) => ({
      code,
      name: locale.meta?.name ?? code
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
