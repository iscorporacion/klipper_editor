import spanish from "@/locales/es.json";

export function translateBackupMessage(message: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  for (const [key, template] of Object.entries(spanish.messages)) {
    if (!key.startsWith("backups.issue.")) continue;
    if (template === message) return t(key);
    const marker = template.indexOf("{path}");
    if (marker >= 0) {
      const prefix = template.slice(0, marker), suffix = template.slice(marker + 6);
      if (message.startsWith(prefix) && message.endsWith(suffix)) return t(key, { path: message.slice(prefix.length, suffix ? -suffix.length : undefined) });
    }
  }
  return message;
}
