// Pure helpers shared by the editor and the standalone MCP bridge.
export const BACKUP_DIRECTORY = ".keditor-backups";
export const BACKUP_RULES_FILE = ".keditor-backup-rules.json";
export const defaultBackupRules = [
  ["bak", "*.bak", "file"], ["bak-extra", "*.bak.*", "file"],
  ["bkp", "*.bkp*", "file"], ["backup", "*.backup*", "file"],
  ["old", "*.old", "file"], ["orig", "*.orig", "file"], ["tilde", "*~", "file"],
  ["mcp", "*.mcp-backup-*", "file"],
  ["dated", "*-????????_??????.*", "file"],
  ["dated-dash", "*-????????-??????.*", "file"],
  ["dated-utc", "*-????????T??????Z.*", "file"],
  ["dated-suffix", "*-????????_??????-*.*", "file"],
  ["hh-old", "mmu.old-*", "directory"]
].map(([id, pattern, kind]) => ({ id, pattern, kind, enabled: true }));

/** Match one path segment without regex backtracking. @param {string} value @param {string} pattern */
function segmentMatches(value, pattern) {
  let v = 0, p = 0, star = -1, retry = 0;
  while (v < value.length) {
    if (pattern[p] === "?" || pattern[p] === value[v]) { v++; p++; }
    else if (pattern[p] === "*") { star = p++; retry = v; }
    else if (star >= 0) { p = star + 1; v = ++retry; }
    else return false;
  }
  while (pattern[p] === "*") p++;
  return p === pattern.length;
}

/** @param {string} filePath @param {string} pattern @param {boolean} basenameOnly */
export function matchesBackupGlob(filePath, pattern, basenameOnly = true) {
  const values = filePath.replace(/\\/g, "/").toLowerCase().split("/");
  const patterns = pattern.toLowerCase().split("/");
  if (patterns.length === 1 && basenameOnly) return segmentMatches(values.at(-1) ?? "", patterns[0]);
  const memo = new Map();
  const match = (v, p) => {
    const key = `${v}:${p}`;
    if (memo.has(key)) return memo.get(key);
    const result = p === patterns.length ? v === values.length
      : patterns[p] === "**" ? match(v, p + 1) || (v < values.length && match(v + 1, p))
        : v < values.length && segmentMatches(values[v], patterns[p]) && match(v + 1, p + 1);
    memo.set(key, result);
    return result;
  };
  return match(0, 0);
}

/** @param {string} filePath @param {string} kind @param {{ pattern: string, kind: string, enabled: boolean }[]} rules */
export function isBackupPath(filePath, kind = "file", rules = defaultBackupRules) {
  const parts = filePath.replace(/\\/g, "/").split("/");
  if (parts.some((part) => part.toLowerCase() === BACKUP_DIRECTORY)) return true;
  return parts.some((_, index) => {
    const partKind = index === parts.length - 1 ? kind : "directory";
    const relative = parts.slice(0, index + 1).join("/");
    return rules.some((rule) => rule.enabled && (rule.kind === "both" || rule.kind === partKind) && matchesBackupGlob(relative, rule.pattern));
  });
}

/** @param {string} filePath */
export function isBackupFilePath(filePath) {
  return isBackupPath(filePath);
}

/** @param {string} originalPath @param {string} unique */
export function backupRelativePath(originalPath, unique, date = new Date()) {
  const parts = originalPath.replace(/\\/g, "/").split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":")) || !/^[a-zA-Z0-9-]+$/.test(unique)) throw new Error("Invalid backup path");
  if (parts[0] === BACKUP_DIRECTORY) parts.shift();
  const filename = parts.pop();
  if (!filename) throw new Error("Invalid backup filename");
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [BACKUP_DIRECTORY, ...parts, `${filename}-${stamp}-${unique}.bak`].join("/");
}
