import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

const execute = promisify(execFile);
let cached: { installed: boolean; checkedAt: number } | undefined;
let checking: Promise<boolean> | undefined;

export function invalidateCloudflaredStatus() { cached = undefined; }

export async function isCloudflaredInstalled(): Promise<boolean> {
  if (cached && Date.now() - cached.checkedAt < 15000) return cached.installed;
  if (checking) return checking;
  checking = (async () => {
    const candidates = process.env.KLIPPER_EDITOR_CLOUDFLARED_BIN
      ? [process.env.KLIPPER_EDITOR_CLOUDFLARED_BIN]
      : [join(homedir(), ".local", "bin", "cloudflared"), "/usr/local/bin/cloudflared", "cloudflared"];
    for (const candidate of candidates) {
      try {
        const { stdout } = await execute(candidate, ["--version"], { timeout: 3000, windowsHide: true });
        if (stdout.includes("cloudflared version")) {
          cached = { installed: true, checkedAt: Date.now() };
          return true;
        }
      } catch { /* Try the next supported installation location. */ }
    }
    cached = { installed: false, checkedAt: Date.now() };
    return false;
  })();
  try { return await checking; } finally { checking = undefined; }
}
